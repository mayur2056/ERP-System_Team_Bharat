const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, authorize('admin', 'accountant'), branchFilter);

// GET /api/purchase-bills
router.get('/', async (req, res, next) => {
  try {
    const { payment_status, vendor_id } = req.query;
    let sql = `SELECT pb.*, v.name AS vendor_name, b.name AS branch_name, u.name AS created_by_name
               FROM purchase_bills pb
               JOIN vendors v ON v.id = pb.vendor_id
               JOIN branches b ON b.id = pb.branch_id
               JOIN users u ON u.id = pb.created_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND pb.branch_id = ?'; params.push(req.branchId); }
    if (payment_status) { sql += ' AND pb.payment_status = ?'; params.push(payment_status); }
    if (vendor_id)      { sql += ' AND pb.vendor_id = ?'; params.push(vendor_id); }
    sql += ' ORDER BY pb.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/purchase-bills
router.post('/', async (req, res, next) => {
  try {
    const { vendor_id, bill_date, due_date, subtotal, gst_amount, total_amount,
            payment_mode, po_reference, notes } = req.body;
    if (!vendor_id || !bill_date || !due_date || !total_amount) {
      throw new AppError('vendor_id, bill_date, due_date, total_amount required', 400);
    }
    const bid = req.user.role === 'admin' ? (req.body.branch_id || req.user.branch_id) : req.user.branch_id;
    const billNo = await getNextSequence('BILL');

    const [result] = await pool.query(
      `INSERT INTO purchase_bills (bill_no, branch_id, vendor_id, created_by,
       bill_date, due_date, subtotal, gst_amount, total_amount, payment_mode, po_reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [billNo, bid, vendor_id, req.user.id, bill_date, due_date,
       subtotal || 0, gst_amount || 0, total_amount, payment_mode || 'bank', po_reference, notes]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, bill_no: billNo } });
  } catch (err) { next(err); }
});

// GET /api/vendors
router.get('/vendors', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vendors WHERE is_active = TRUE ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
