const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, branchFilter } = require('../middleware/auth');

router.use(authenticate, branchFilter);

// GET /api/vendors
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM vendors WHERE is_active = TRUE';
    const params = [];
    if (search) { sql += ' AND (name LIKE ? OR contact_person LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY name';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/vendors/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
    if (rows.length === 0) throw new AppError('Vendor not found', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/vendors
router.post('/', async (req, res, next) => {
  try {
    const { name, contact_person, phone, email, address, gstin, credit_terms } = req.body;
    if (!name) throw new AppError('Vendor name required', 400);
    const [result] = await pool.query(
      `INSERT INTO vendors (name, contact_person, phone, email, address, gstin, credit_terms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, contact_person, phone, email, address, gstin, credit_terms || 30]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) { next(err); }
});

// PUT /api/vendors/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, contact_person, phone, email, address, gstin, credit_terms, is_active } = req.body;
    await pool.query(
      `UPDATE vendors SET name=?, contact_person=?, phone=?, email=?, address=?,
       gstin=?, credit_terms=?, is_active=? WHERE id=?`,
      [name, contact_person, phone, email, address, gstin, credit_terms,
       is_active !== undefined ? is_active : true, req.params.id]
    );
    res.json({ success: true, message: 'Vendor updated' });
  } catch (err) { next(err); }
});

module.exports = router;
