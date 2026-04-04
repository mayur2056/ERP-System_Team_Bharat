const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, branchFilter);

// GET /api/dispatches
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = `SELECT d.*, o.order_no, c.name AS customer_name, b.name AS branch_name,
                      u.name AS dispatched_by_name
               FROM dispatches d
               JOIN orders o ON o.id = d.order_id
               JOIN customers c ON c.id = o.customer_id
               JOIN branches b ON b.id = d.branch_id
               JOIN users u ON u.id = d.dispatched_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND d.branch_id = ?'; params.push(req.branchId); }
    if (status) { sql += ' AND d.status = ?'; params.push(status); }
    sql += ' ORDER BY d.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/dispatches — create dispatch for approved order
router.post('/', authorize('admin', 'sales_warehouse', 'branch_manager'), async (req, res, next) => {
  try {
    const { order_id, driver_name, vehicle_no, expected_delivery, delivery_notes } = req.body;
    if (!order_id) throw new AppError('order_id is required', 400);

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orders.length === 0) throw new AppError('Order not found', 404);
    if (orders[0].status !== 'approved') throw new AppError('Order must be approved before dispatch', 400);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const dispatchNo = await getNextSequence('DSP');

      const [result] = await conn.query(
        `INSERT INTO dispatches (dispatch_no, order_id, branch_id, dispatched_by,
         driver_name, vehicle_no, dispatch_date, expected_delivery, status, delivery_notes)
         VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, 'dispatched', ?)`,
        [dispatchNo, order_id, orders[0].branch_id, req.user.id,
         driver_name, vehicle_no, expected_delivery, delivery_notes]
      );

      // Update order status to dispatched
      await conn.query('UPDATE orders SET status = "dispatched", updated_at = NOW() WHERE id = ?', [order_id]);

      await conn.commit();
      res.status(201).json({ success: true, data: { id: result.insertId, dispatch_no: dispatchNo } });
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  } catch (err) { next(err); }
});

// PATCH /api/dispatches/:id/status — update dispatch status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['prepared', 'dispatched', 'in_transit', 'delivered', 'returned'];
    if (!valid.includes(status)) throw new AppError('Invalid dispatch status', 400);

    await pool.query('UPDATE dispatches SET status = ? WHERE id = ?', [status, req.params.id]);

    // If delivered, update the order too
    if (status === 'delivered') {
      const [dispatches] = await pool.query('SELECT order_id FROM dispatches WHERE id = ?', [req.params.id]);
      if (dispatches.length > 0) {
        await pool.query('UPDATE dispatches SET actual_delivery = CURDATE() WHERE id = ?', [req.params.id]);
        await pool.query('UPDATE orders SET status = "delivered", updated_at = NOW() WHERE id = ?', [dispatches[0].order_id]);
      }
    }

    res.json({ success: true, message: 'Dispatch status updated' });
  } catch (err) { next(err); }
});

module.exports = router;
