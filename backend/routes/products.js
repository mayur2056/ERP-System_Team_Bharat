const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/products
router.get('/', async (req, res, next) => {
  try {
    const { category_id, brand, search, is_active } = req.query;
    let sql = `SELECT p.*, pc.name AS category_name
               FROM products p
               LEFT JOIN product_categories pc ON pc.id = p.category_id
               WHERE 1=1`;
    const params = [];
    if (category_id)  { sql += ' AND p.category_id = ?'; params.push(category_id); }
    if (brand)        { sql += ' AND p.brand = ?'; params.push(brand); }
    if (search)       { sql += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (is_active !== undefined) { sql += ' AND p.is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    else { sql += ' AND p.is_active = TRUE'; }
    sql += ' ORDER BY p.name';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/products/categories
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM product_categories ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, pc.name AS category_name
       FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE p.id = ?`, [req.params.id]
    );
    if (rows.length === 0) throw new AppError('Product not found', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/products (admin only)
router.post('/', authorize('admin'), async (req, res, next) => {
  try {
    const { sku, name, category_id, brand, unit, base_price, gst_rate, hsn_code, description } = req.body;
    if (!sku || !name) throw new AppError('SKU and name required', 400);
    const [result] = await pool.query(
      `INSERT INTO products (sku, name, category_id, brand, unit, base_price, gst_rate, hsn_code, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku, name, category_id, brand, unit || 'Pcs', base_price || 0, gst_rate || 18, hsn_code, description]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) { next(err); }
});

// PUT /api/products/:id (admin only)
router.put('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const { sku, name, category_id, brand, unit, base_price, gst_rate, hsn_code, description, is_active } = req.body;
    await pool.query(
      `UPDATE products SET sku=?, name=?, category_id=?, brand=?, unit=?,
       base_price=?, gst_rate=?, hsn_code=?, description=?, is_active=? WHERE id=?`,
      [sku, name, category_id, brand, unit, base_price, gst_rate, hsn_code, description,
       is_active !== undefined ? is_active : true, req.params.id]
    );
    res.json({ success: true, message: 'Product updated' });
  } catch (err) { next(err); }
});

module.exports = router;
