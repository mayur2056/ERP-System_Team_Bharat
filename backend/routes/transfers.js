const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, branchFilter);

// GET /api/transfers
router.get('/', async (req, res, next) => {
  try {
    const { status, direction } = req.query;
    let sql = `SELECT t.*, fb.name AS from_branch_name, tb.name AS to_branch_name,
                      u1.name AS requested_by_name
               FROM transfers t
               JOIN branches fb ON fb.id = t.from_branch_id
               JOIN branches tb ON tb.id = t.to_branch_id
               JOIN users u1 ON u1.id = t.requested_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId) {
      if (direction === 'incoming') {
        sql += ' AND t.to_branch_id = ?'; params.push(req.branchId);
      } else if (direction === 'outgoing') {
        sql += ' AND t.from_branch_id = ?'; params.push(req.branchId);
      } else {
        sql += ' AND (t.from_branch_id = ? OR t.to_branch_id = ?)';
        params.push(req.branchId, req.branchId);
      }
    }
    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    sql += ' ORDER BY t.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/transfers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [transfers] = await pool.query(
      `SELECT t.*, fb.name AS from_branch_name, tb.name AS to_branch_name,
              u1.name AS requested_by_name
       FROM transfers t
       JOIN branches fb ON fb.id = t.from_branch_id
       JOIN branches tb ON tb.id = t.to_branch_id
       JOIN users u1 ON u1.id = t.requested_by
       WHERE t.id = ?`, [req.params.id]);
    if (transfers.length === 0) throw new AppError('Transfer not found', 404);

    const [items] = await pool.query(
      `SELECT ti.*, p.name AS product_name, p.sku
       FROM transfer_items ti JOIN products p ON p.id = ti.product_id
       WHERE ti.transfer_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...transfers[0], items } });
  } catch (err) { next(err); }
});

// POST /api/transfers — create transfer request
router.post('/', authorize('admin', 'sales_warehouse', 'branch_manager'), async (req, res, next) => {
  try {
    const { from_branch_id, to_branch_id, items, notes } = req.body;
    if (!from_branch_id || !to_branch_id || !items || items.length === 0) {
      throw new AppError('from_branch_id, to_branch_id, and items[] required', 400);
    }
    if (from_branch_id === to_branch_id) throw new AppError('Cannot transfer to same branch', 400);

    if (req.user.role !== 'admin') {
      if (req.user.branch_id !== from_branch_id && req.user.branch_id !== to_branch_id) {
         throw new AppError('You can only initiate transfers involving your own branch', 403);
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const transferNo = await getNextSequence('TRF');
      const [result] = await conn.query(
        `INSERT INTO transfers (transfer_no, from_branch_id, to_branch_id, requested_by, status, request_date, notes)
         VALUES (?, ?, ?, ?, 'pending_local', CURDATE(), ?)`,
        [transferNo, from_branch_id, to_branch_id, req.user.id, notes]
      );
      const transferId = result.insertId;

      for (const item of items) {
        await conn.query(
          'INSERT INTO transfer_items (transfer_id, product_id, quantity) VALUES (?, ?, ?)',
          [transferId, item.product_id, item.quantity]
        );
      }

      // Notify the from-branch manager
      await conn.query(
        `INSERT INTO notifications (recipient_id, branch_id, type, title, message, reference_type, reference_id)
         SELECT u.id, ?, 'transfer_request', ?, ?, 'transfer', ?
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'branch_manager' AND u.branch_id = ?`,
        [from_branch_id, `Transfer Request ${transferNo}`,
         `Transfer ${transferNo} requested from your branch`, transferId, from_branch_id]
      );

      await conn.commit();
      res.status(201).json({ success: true, data: { id: transferId, transfer_no: transferNo } });
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  } catch (err) { next(err); }
});

// PATCH /api/transfers/:id/approve — managers approve stage by stage
router.patch('/:id/approve', authorize('admin', 'branch_manager'), async (req, res, next) => {
  try {
    const { action, rejection_reason } = req.body;
    if (!['approve', 'reject'].includes(action)) throw new AppError('Invalid action', 400);

    const [transfers] = await pool.query('SELECT * FROM transfers WHERE id = ?', [req.params.id]);
    if (transfers.length === 0) throw new AppError('Transfer not found', 404);
    const transfer = transfers[0];
    if (!['pending_local', 'pending_remote'].includes(transfer.status)) {
      throw new AppError('Transfer is not pending', 400);
    }

    if (action === 'approve') {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const isToBM = req.user.role === 'admin' || req.user.branch_id === transfer.to_branch_id;
        const isFromBM = req.user.role === 'admin' || req.user.branch_id === transfer.from_branch_id;

        if (transfer.status === 'pending_local') {
          // If receiving branch requested it, local BM approves it first
          if (isToBM && transfer.requested_by !== transfer.from_branch_id) {
             await conn.query(`UPDATE transfers SET status = 'pending_remote', approved_by_to = ? WHERE id = ?`, [req.user.id, transfer.id]);
          } 
          // If sending branch requested it, it's immediately approved
          else if (isFromBM) {
             await conn.query(`UPDATE transfers SET status = 'approved', approved_by_from = ?, dispatch_date = CURDATE() WHERE id = ?`, [req.user.id, transfer.id]);
             
            // Deduct from source branch inventory
            const [items] = await conn.query('SELECT * FROM transfer_items WHERE transfer_id = ?', [transfer.id]);
            for (const item of items) {
              await conn.query('UPDATE inventory SET available_qty = available_qty - ? WHERE branch_id = ? AND product_id = ?', [item.quantity, transfer.from_branch_id, item.product_id]);
              await conn.query(`INSERT INTO inventory_transactions (branch_id, product_id, txn_type, quantity, reference_type, reference_id, performed_by) VALUES (?, ?, 'transfer_out', ?, 'transfer', ?, ?)`, [transfer.from_branch_id, item.product_id, item.quantity, transfer.id, req.user.id]);
            }
          } else { throw new AppError('Unauthorized to advance status at this localized stage', 403); }
        } else if (transfer.status === 'pending_remote') {
          if (isFromBM) {
            await conn.query(`UPDATE transfers SET status = 'approved', approved_by_from = ?, dispatch_date = CURDATE() WHERE id = ?`, [req.user.id, transfer.id]);
             
            // Deduct from source branch inventory
            const [items] = await conn.query('SELECT * FROM transfer_items WHERE transfer_id = ?', [transfer.id]);
            for (const item of items) {
              await conn.query('UPDATE inventory SET available_qty = available_qty - ? WHERE branch_id = ? AND product_id = ?', [item.quantity, transfer.from_branch_id, item.product_id]);
              await conn.query(`INSERT INTO inventory_transactions (branch_id, product_id, txn_type, quantity, reference_type, reference_id, performed_by) VALUES (?, ?, 'transfer_out', ?, 'transfer', ?, ?)`, [transfer.from_branch_id, item.product_id, item.quantity, transfer.id, req.user.id]);
            }
          } else { throw new AppError('Unauthorized to approve remote fulfillment stage', 403); }
        }

        await conn.commit();
      } catch (err) { await conn.rollback(); throw err; }
      finally { conn.release(); }
    } else {
      await pool.query(
        `UPDATE transfers SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
        [rejection_reason, transfer.id]);
    }

    res.json({ success: true, message: `Transfer ${action}d` });
  } catch (err) { next(err); }
});

// PATCH /api/transfers/:id/receive — to-branch confirms receipt
router.patch('/:id/receive', authorize('admin', 'branch_manager', 'sales_warehouse'), async (req, res, next) => {
  try {
    const { received_items } = req.body; // [{ transfer_item_id, received_qty }]

    const [transfers] = await pool.query('SELECT * FROM transfers WHERE id = ?', [req.params.id]);
    if (transfers.length === 0) throw new AppError('Transfer not found', 404);
    const transfer = transfers[0];
    if (!['approved', 'in_transit'].includes(transfer.status)) throw new AppError('Transfer not ready for receipt', 400);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE transfers SET status = 'received', approved_by_to = ?, received_date = CURDATE()
         WHERE id = ?`, [req.user.id, transfer.id]);

      const [items] = await conn.query(
        'SELECT * FROM transfer_items WHERE transfer_id = ?', [transfer.id]);

      for (const item of items) {
        const recvQty = received_items
          ? (received_items.find(r => r.transfer_item_id === item.id)?.received_qty || item.quantity)
          : item.quantity;

        await conn.query('UPDATE transfer_items SET received_qty = ? WHERE id = ?', [recvQty, item.id]);

        // Add to destination branch inventory
        await conn.query(
          `INSERT INTO inventory (branch_id, product_id, available_qty)
           VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE available_qty = available_qty + ?`,
          [transfer.to_branch_id, item.product_id, recvQty, recvQty]);

        await conn.query(
          `INSERT INTO inventory_transactions
           (branch_id, product_id, txn_type, quantity, reference_type, reference_id, performed_by)
           VALUES (?, ?, 'transfer_in', ?, 'transfer', ?, ?)`,
          [transfer.to_branch_id, item.product_id, recvQty, transfer.id, req.user.id]);
      }

      await conn.commit();
      res.json({ success: true, message: 'Transfer received and inventory updated' });
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  } catch (err) { next(err); }
});

module.exports = router;
