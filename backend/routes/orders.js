const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, branchFilter);

// GET /api/orders
router.get('/', async (req, res, next) => {
  try {
    const { status, customer_id, search, from_date, to_date } = req.query;
    let sql = `SELECT o.*, c.name AS customer_name, b.name AS branch_name,
                      u1.name AS created_by_name, u2.name AS approved_by_name
               FROM orders o
               JOIN customers c ON c.id = o.customer_id
               JOIN branches b ON b.id = o.branch_id
               JOIN users u1 ON u1.id = o.created_by
               LEFT JOIN users u2 ON u2.id = o.approved_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId)   { sql += ' AND o.branch_id = ?'; params.push(req.branchId); }
    if (status)         { sql += ' AND o.status = ?'; params.push(status); }
    if (customer_id)    { sql += ' AND o.customer_id = ?'; params.push(customer_id); }
    if (search)         { sql += ' AND (o.order_no LIKE ? OR c.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (from_date)      { sql += ' AND o.order_date >= ?'; params.push(from_date); }
    if (to_date)        { sql += ' AND o.order_date <= ?'; params.push(to_date); }
    sql += ' ORDER BY o.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
              b.name AS branch_name, u1.name AS created_by_name, u2.name AS approved_by_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN branches b ON b.id = o.branch_id
       JOIN users u1 ON u1.id = o.created_by
       LEFT JOIN users u2 ON u2.id = o.approved_by
       WHERE o.id = ?`, [req.params.id]);
    if (orders.length === 0) throw new AppError('Order not found', 404);

    const [items] = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.sku
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`, [req.params.id]);

    res.json({ success: true, data: { ...orders[0], items } });
  } catch (err) { next(err); }
});

// POST /api/orders — create new order
router.post('/', authorize('admin', 'sales_warehouse'), async (req, res, next) => {
  try {
    const { customer_id, items, priority, expected_date, notes } = req.body;
    if (!customer_id || !items || items.length === 0) {
      throw new AppError('customer_id and items[] are required', 400);
    }
    const bid = req.user.role === 'admin' ? (req.body.branch_id || req.user.branch_id) : req.user.branch_id;
    if (!bid) throw new AppError('Branch is required', 400);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const orderNo = await getNextSequence('ORD');

      // Calculate totals
      let subtotal = 0;
      for (const item of items) {
        subtotal += item.quantity * item.unit_price;
      }
      let gstAmount = 0;
      for (const item of items) {
        gstAmount += item.quantity * item.unit_price * ((item.gst_rate || 18) / 100);
      }
      gstAmount = Math.round(gstAmount * 100) / 100;
      const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;

      const [result] = await conn.query(
        `INSERT INTO orders (order_no, branch_id, customer_id, created_by, status, priority,
         order_date, expected_date, subtotal, gst_amount, total_amount, notes)
         VALUES (?, ?, ?, ?, 'pending_approval', ?, CURDATE(), ?, ?, ?, ?, ?)`,
        [orderNo, bid, customer_id, req.user.id, priority || 'medium',
         expected_date || null, subtotal, gstAmount, totalAmount, notes]
      );
      const orderId = result.insertId;

      // Insert items
      for (const item of items) {
        await conn.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price, gst_rate)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.quantity, item.unit_price, item.gst_rate || 18]
        );
      }

      // Create notification for branch manager
      await conn.query(
        `INSERT INTO notifications (recipient_id, branch_id, type, title, message, reference_type, reference_id)
         SELECT u.id, ?, 'order_pending', ?, ?, 'order', ?
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'branch_manager' AND u.branch_id = ?`,
        [bid, `New Order ${orderNo}`,
         `Order ${orderNo} for ₹${totalAmount.toLocaleString()} awaiting approval`,
         orderId, bid]
      );

      await conn.commit();
      res.status(201).json({ success: true, data: { id: orderId, order_no: orderNo } });
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  } catch (err) { next(err); }
});

// PATCH /api/orders/:id/approve — branch manager approves/rejects
router.patch('/:id/approve', authorize('admin', 'branch_manager'), async (req, res, next) => {
  try {
    const { action, rejection_reason } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) throw new AppError('action must be approve or reject', 400);

    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (orders.length === 0) throw new AppError('Order not found', 404);
    const order = orders[0];
    if (order.status !== 'pending_approval') throw new AppError('Order is not pending approval', 400);

    // Branch manager can only approve their branch orders
    if (req.user.role === 'branch_manager' && order.branch_id !== req.user.branch_id) {
      throw new AppError('Cannot approve orders from other branches', 403);
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE orders SET status = ?, approved_by = ?, rejection_reason = ?, updated_at = NOW()
         WHERE id = ?`,
        [newStatus, req.user.id, action === 'reject' ? rejection_reason : null, req.params.id]
      );

      if (action === 'approve') {
        // Automatically generate Invoice
        const invNo = await getNextSequence('INV');
        await conn.query(
          `INSERT INTO invoices (invoice_no, branch_id, order_id, customer_id, created_by,
           invoice_date, due_date, subtotal, cgst_amount, sgst_amount, igst_amount,
           total_amount, payment_mode, notes)
           VALUES (?, ?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), ?, ?, ?, ?, ?, 'bank', 'Auto-generated on approval')`,
          [invNo, order.branch_id, order.id, order.customer_id, req.user.id,
           order.total_amount * 0.82, order.total_amount * 0.09, order.total_amount * 0.09, 0, order.total_amount]
        );
      }

      // Notify sales user
      const notifType = action === 'approve' ? 'order_approved' : 'order_rejected';
      await conn.query(
        `INSERT INTO notifications (recipient_id, branch_id, type, title, message, reference_type, reference_id)
         VALUES (?, ?, ?, ?, ?, 'order', ?)`,
        [order.created_by, order.branch_id, notifType,
         `Order ${order.order_no} ${newStatus}`,
         `Your order ${order.order_no} has been ${newStatus}${rejection_reason ? ': ' + rejection_reason : ''}`,
         order.id]
      );

      await conn.commit();
      res.json({ success: true, message: `Order ${newStatus}${action === 'approve' ? ' and Invoice generated' : ''}` });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});

// PATCH /api/orders/:id/status — update order status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'pending_approval', 'approved', 'dispatched', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) throw new AppError('Invalid status', 400);
    await pool.query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) { next(err); }
});

module.exports = router;
