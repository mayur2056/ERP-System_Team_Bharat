const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, branchFilter } = require('../middleware/auth');

router.use(authenticate, branchFilter);

// GET /api/customers
router.get('/', async (req, res, next) => {
  try {
    const { search, status } = req.query;
    let sql = `SELECT c.*, b.name AS branch_name FROM customers c
               JOIN branches b ON b.id = c.branch_id WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND c.branch_id = ?'; params.push(req.branchId); }
    if (search) { sql += ' AND (c.name LIKE ? OR c.contact_person LIKE ? OR c.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status === 'active')   sql += ' AND c.is_active = TRUE';
    if (status === 'inactive') sql += ' AND c.is_active = FALSE';
    sql += ' ORDER BY c.name';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/customers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, b.name AS branch_name FROM customers c
       JOIN branches b ON b.id = c.branch_id WHERE c.id = ?`, [req.params.id]);
    if (rows.length === 0) throw new AppError('Customer not found', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/customers
router.post('/', async (req, res, next) => {
  try {
    const { name, type, contact_person, phone, email, address, city, state, gstin, credit_limit } = req.body;
    if (!name) throw new AppError('Customer name is required', 400);
    const bid = req.user.role === 'admin' ? (req.body.branch_id || req.user.branch_id) : req.user.branch_id;
    if (!bid) throw new AppError('Branch ID is required', 400);
    const [result] = await pool.query(
      `INSERT INTO customers (branch_id, name, type, contact_person, phone, email, address, city, state, gstin, credit_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bid, name, type || 'Retail', contact_person, phone, email, address, city, state, gstin, credit_limit || 0]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) { next(err); }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, type, contact_person, phone, email, address, city, state, gstin, credit_limit, is_active } = req.body;
    await pool.query(
      `UPDATE customers SET name=?, type=?, contact_person=?, phone=?, email=?, address=?,
       city=?, state=?, gstin=?, credit_limit=?, is_active=? WHERE id=?`,
      [name, type, contact_person, phone, email, address, city, state, gstin, credit_limit,
       is_active !== undefined ? is_active : true, req.params.id]
    );
    res.json({ success: true, message: 'Customer updated' });
  } catch (err) { next(err); }
});

module.exports = router;
