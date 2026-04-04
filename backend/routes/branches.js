const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/branches
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM branches WHERE is_active = TRUE ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/branches/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM branches WHERE id = ?', [req.params.id]);
    if (rows.length === 0) throw new AppError('Branch not found', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/branches (admin only)
router.post('/', authorize('admin'), async (req, res, next) => {
  try {
    const { name, address, city, state, pincode, phone, gstin } = req.body;
    if (!name) throw new AppError('Branch name is required', 400);
    const [result] = await pool.query(
      'INSERT INTO branches (name, address, city, state, pincode, phone, gstin) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, address, city, state, pincode, phone, gstin]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) { next(err); }
});

// PUT /api/branches/:id (admin only)
router.put('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const { name, address, city, state, pincode, phone, gstin, is_active } = req.body;
    await pool.query(
      `UPDATE branches SET name=?, address=?, city=?, state=?, pincode=?, phone=?, gstin=?, is_active=?
       WHERE id=?`,
      [name, address, city, state, pincode, phone, gstin, is_active !== undefined ? is_active : true, req.params.id]
    );
    res.json({ success: true, message: 'Branch updated' });
  } catch (err) { next(err); }
});

module.exports = router;
