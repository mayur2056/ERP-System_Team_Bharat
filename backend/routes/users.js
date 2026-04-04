const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');

// All user routes require admin
router.use(authenticate, authorize('admin'));

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.is_active, u.last_login, u.created_at,
              u.branch_id, r.name AS role, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       ORDER BY u.id`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.is_active, u.last_login, u.created_at,
              u.branch_id, r.name AS role, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) throw new AppError('User not found', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role_id, branch_id } = req.body;
    if (!name || !email || !password || !role_id) {
      throw new AppError('name, email, password, role_id are required', 400);
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role_id, branch_id) VALUES (?, ?, ?, ?, ?)',
      [name, email, hash, role_id, branch_id || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, role_id, branch_id, is_active } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined)      { fields.push('name = ?');      values.push(name); }
    if (email !== undefined)     { fields.push('email = ?');     values.push(email); }
    if (role_id !== undefined)   { fields.push('role_id = ?');   values.push(role_id); }
    if (branch_id !== undefined) { fields.push('branch_id = ?'); values.push(branch_id); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }
    if (fields.length === 0) throw new AppError('No fields to update', 400);
    values.push(req.params.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: 'User updated' });
  } catch (err) { next(err); }
});

// PUT /api/users/:id/password
router.put('/:id/password', async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) throw new AppError('Password required', 400);
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
});

// GET /api/users/roles (list available roles)
router.get('/roles/list', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM roles ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
