const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, authorize('admin', 'accountant'), branchFilter);

// GET /api/invoices
router.get('/', async (req, res, next) => {
  try {
    const { payment_status, customer_id, search } = req.query;
    let sql = `SELECT inv.*, c.name AS customer_name, b.name AS branch_name, u.name AS created_by_name
               FROM invoices inv
               JOIN customers c ON c.id = inv.customer_id
               JOIN branches b ON b.id = inv.branch_id
               JOIN users u ON u.id = inv.created_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND inv.branch_id = ?'; params.push(req.branchId); }
    if (payment_status) { sql += ' AND inv.payment_status = ?'; params.push(payment_status); }
    if (customer_id)    { sql += ' AND inv.customer_id = ?'; params.push(customer_id); }
    if (search) { sql += ' AND (inv.invoice_no LIKE ? OR c.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY inv.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/invoices/receivables — aging report
router.get('/receivables', async (req, res, next) => {
  try {
    let sql = 'SELECT * FROM v_receivables WHERE 1=1';
    const params = [];
    if (req.branchId) { sql += ' AND branch_id = ?'; params.push(req.branchId); }
    sql += ' ORDER BY days_overdue DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT inv.*, c.name AS customer_name, c.gstin AS customer_gstin,
              b.name AS branch_name, b.gstin AS branch_gstin, u.name AS created_by_name
       FROM invoices inv
       JOIN customers c ON c.id = inv.customer_id
       JOIN branches b ON b.id = inv.branch_id
       JOIN users u ON u.id = inv.created_by
       WHERE inv.id = ?`, [req.params.id]);
    if (rows.length === 0) throw new AppError('Invoice not found', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/invoices
router.post('/', async (req, res, next) => {
  try {
    const { customer_id, order_id, invoice_date, due_date, subtotal,
            cgst_amount, sgst_amount, igst_amount, total_amount, payment_mode, notes } = req.body;
    if (!customer_id || !invoice_date || !due_date || !total_amount) {
      throw new AppError('customer_id, invoice_date, due_date, total_amount required', 400);
    }
    const bid = req.user.role === 'admin' ? (req.body.branch_id || req.user.branch_id) : req.user.branch_id;
    const invoiceNo = await getNextSequence('INV');

    const [result] = await pool.query(
      `INSERT INTO invoices (invoice_no, branch_id, order_id, customer_id, created_by,
       invoice_date, due_date, subtotal, cgst_amount, sgst_amount, igst_amount,
       total_amount, payment_mode, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNo, bid, order_id, customer_id, req.user.id,
       invoice_date, due_date, subtotal || 0, cgst_amount || 0, sgst_amount || 0,
       igst_amount || 0, total_amount, payment_mode || 'bank', notes]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, invoice_no: invoiceNo } });
  } catch (err) { next(err); }
});

// PATCH /api/invoices/:id/mark-paid
router.patch('/:id/mark-paid', async (req, res, next) => {
  try {
    const [invoices] = await pool.query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (invoices.length === 0) throw new AppError('Invoice not found', 404);
    await pool.query(
      `UPDATE invoices SET paid_amount = total_amount, payment_status = 'paid' WHERE id = ?`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Invoice marked as paid' });
  } catch (err) { next(err); }
});

module.exports = router;
