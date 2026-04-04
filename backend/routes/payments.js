const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, authorize('admin', 'accountant'), branchFilter);

// GET /api/payments
router.get('/', async (req, res, next) => {
  try {
    const { payment_type, party_type, status, from_date, to_date } = req.query;
    let sql = `SELECT p.*, b.name AS branch_name, u.name AS recorded_by_name
               FROM payments p
               JOIN branches b ON b.id = p.branch_id
               JOIN users u ON u.id = p.recorded_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId)    { sql += ' AND p.branch_id = ?'; params.push(req.branchId); }
    if (payment_type)    { sql += ' AND p.payment_type = ?'; params.push(payment_type); }
    if (party_type)      { sql += ' AND p.party_type = ?'; params.push(party_type); }
    if (status)          { sql += ' AND p.status = ?'; params.push(status); }
    if (from_date)       { sql += ' AND p.payment_date >= ?'; params.push(from_date); }
    if (to_date)         { sql += ' AND p.payment_date <= ?'; params.push(to_date); }
    sql += ' ORDER BY p.created_at DESC';
    const [rows] = await pool.query(sql, params);
    // Resolve party names
    for (const row of rows) {
      if (row.party_type === 'customer') {
        const [c] = await pool.query('SELECT name FROM customers WHERE id = ?', [row.party_id]);
        row.party_name = c.length ? c[0].name : 'Unknown';
      } else {
        const [v] = await pool.query('SELECT name FROM vendors WHERE id = ?', [row.party_id]);
        row.party_name = v.length ? v[0].name : 'Unknown';
      }
    }
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/payments
router.post('/', async (req, res, next) => {
  try {
    const { payment_type, party_type, party_id, reference_type, reference_id,
            amount, payment_mode, payment_date, status, notes } = req.body;
    if (!payment_type || !party_type || !party_id || !amount || !payment_mode || !payment_date) {
      throw new AppError('payment_type, party_type, party_id, amount, payment_mode, payment_date required', 400);
    }
    const bid = req.user.role === 'admin' ? (req.body.branch_id || req.user.branch_id) : req.user.branch_id;
    const paymentNo = await getNextSequence('PAY');

    const [result] = await pool.query(
      `INSERT INTO payments (payment_no, branch_id, payment_type, party_type, party_id,
       reference_type, reference_id, amount, payment_mode, payment_date, status, recorded_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentNo, bid, payment_type, party_type, party_id,
       reference_type || 'invoice', reference_id, amount, payment_mode,
       payment_date, status || 'completed', req.user.id, notes]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, payment_no: paymentNo } });
  } catch (err) { next(err); }
});

module.exports = router;
