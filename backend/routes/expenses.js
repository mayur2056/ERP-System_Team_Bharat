const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, branchFilter);

// GET /api/expenses
router.get('/', async (req, res, next) => {
  try {
    const { category_id, status, from_date, to_date } = req.query;
    let sql = `SELECT e.*, ec.name AS category_name, b.name AS branch_name,
                      u1.name AS recorded_by_name, u2.name AS approved_by_name
               FROM expenses e
               JOIN expense_categories ec ON ec.id = e.category_id
               JOIN branches b ON b.id = e.branch_id
               JOIN users u1 ON u1.id = e.recorded_by
               LEFT JOIN users u2 ON u2.id = e.approved_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId)  { sql += ' AND e.branch_id = ?'; params.push(req.branchId); }
    if (category_id)   { sql += ' AND e.category_id = ?'; params.push(category_id); }
    if (status)        { sql += ' AND e.status = ?'; params.push(status); }
    if (from_date)     { sql += ' AND e.expense_date >= ?'; params.push(from_date); }
    if (to_date)       { sql += ' AND e.expense_date <= ?'; params.push(to_date); }
    sql += ' ORDER BY e.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/expenses/categories
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM expense_categories ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/expenses
router.post('/', authorize('admin', 'accountant', 'branch_manager'), async (req, res, next) => {
  try {
    const { category_id, vendor_name, amount, payment_mode, expense_date, reference_no, notes } = req.body;
    if (!category_id || !amount || !expense_date) {
      throw new AppError('category_id, amount, expense_date required', 400);
    }
    const bid = req.user.role === 'admin' ? (req.body.branch_id || req.user.branch_id) : req.user.branch_id;
    const expNo = await getNextSequence('EXP');

    const [result] = await pool.query(
      `INSERT INTO expenses (expense_no, branch_id, category_id, vendor_name, amount,
       payment_mode, expense_date, reference_no, status, recorded_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [expNo, bid, category_id, vendor_name, amount,
       payment_mode || 'cash', expense_date, reference_no, req.user.id, notes]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, expense_no: expNo } });
  } catch (err) { next(err); }
});

// PATCH /api/expenses/:id/approve
router.patch('/:id/approve', authorize('admin', 'branch_manager'), async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) throw new AppError('Invalid action', 400);
    const status = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE expenses SET status = ?, approved_by = ? WHERE id = ?',
      [status, req.user.id, req.params.id]
    );
    res.json({ success: true, message: `Expense ${status}` });
  } catch (err) { next(err); }
});

module.exports = router;
