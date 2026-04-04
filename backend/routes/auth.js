const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email and password required', 400);

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.is_active,
              u.branch_id, r.name AS role, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.email = ?`,
      [email]
    );

    if (users.length === 0) throw new AppError('Invalid credentials', 401);
    const user = users[0];
    if (!user.is_active) throw new AppError('Account is deactivated', 403);

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) throw new AppError('Invalid credentials', 401);

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Generate JWT
    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branch_name
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

    res.json({
      success: true,
      token,
      user: payload
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.name, u.email, u.is_active, u.last_login, u.created_at,
              u.branch_id, r.name AS role, b.name AS branch_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (users.length === 0) throw new AppError('User not found', 404);
    res.json({ success: true, data: users[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
