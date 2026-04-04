const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, branchFilter);

// GET /api/inventory — branch-scoped inventory list
router.get('/', async (req, res, next) => {
  try {
    const { category_id, search, status } = req.query;
    let sql = `SELECT i.*, p.sku, p.name AS product_name, p.brand, p.unit, p.base_price, p.gst_rate,
                      pc.name AS category_name, b.name AS branch_name
               FROM inventory i
               JOIN products p ON p.id = i.product_id
               LEFT JOIN product_categories pc ON pc.id = p.category_id
               JOIN branches b ON b.id = i.branch_id
               WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND i.branch_id = ?'; params.push(req.branchId); }
    if (category_id)  { sql += ' AND p.category_id = ?'; params.push(category_id); }
    if (search) { sql += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (status === 'low')     { sql += ' AND i.available_qty <= i.min_stock_level AND i.available_qty > 0'; }
    if (status === 'out')     { sql += ' AND i.available_qty <= 0'; }
    if (status === 'in_stock') { sql += ' AND i.available_qty > i.min_stock_level'; }
    sql += ' ORDER BY p.name';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/inventory/low-stock — low stock alerts
router.get('/low-stock', async (req, res, next) => {
  try {
    let sql = 'SELECT * FROM v_low_stock_alerts WHERE 1=1';
    const params = [];
    if (req.branchId) { sql += ' AND branch_id = ?'; params.push(req.branchId); }
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/inventory/stock-entry — add stock
router.post('/stock-entry', authorize('admin', 'branch_manager', 'sales_warehouse'), async (req, res, next) => {
  try {
    const { branch_id, product_id, quantity, unit_cost, rack_location, min_stock_level, notes } = req.body;
    const bid = req.user.role === 'admin' ? branch_id : req.user.branch_id;
    if (!bid || !product_id || !quantity) throw new AppError('branch_id, product_id, quantity required', 400);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Upsert inventory
      await conn.query(
        `INSERT INTO inventory (branch_id, product_id, available_qty, min_stock_level, rack_location)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           available_qty = available_qty + VALUES(available_qty),
           min_stock_level = COALESCE(VALUES(min_stock_level), min_stock_level),
           rack_location = COALESCE(VALUES(rack_location), rack_location)`,
        [bid, product_id, quantity, min_stock_level || 0, rack_location]
      );

      // Log transaction
      await conn.query(
        `INSERT INTO inventory_transactions
         (branch_id, product_id, txn_type, quantity, reference_type, notes, performed_by)
         VALUES (?, ?, 'stock_in', ?, 'purchase', ?, ?)`,
        [bid, product_id, quantity, notes, req.user.id]
      );

      // Automatically generate Purchase Bill
      const billNo = await getNextSequence('BILL');
      const totalCost = (unit_cost || 0) * quantity;
      
      // Get a default vendor if none provided in notes or context (using first vendor for now)
      const [vendors] = await conn.query('SELECT id FROM vendors LIMIT 1');
      const vendorId = vendors[0]?.id || 1;

      await conn.query(
        `INSERT INTO purchase_bills (bill_no, branch_id, vendor_id, created_by,
         bill_date, due_date, subtotal, gst_amount, total_amount, payment_mode, notes)
         VALUES (?, ?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), ?, ?, ?, 'bank', 'Auto-generated from stock entry')`,
        [billNo, bid, vendorId, req.user.id, totalCost * 0.82, totalCost * 0.18, totalCost]
      );

      await conn.commit();
      res.status(201).json({ success: true, message: 'Stock entry recorded' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});

// POST /api/inventory/adjustment
router.post('/adjustment', authorize('admin', 'branch_manager'), async (req, res, next) => {
  try {
    const { branch_id, product_id, quantity, adjustment_type, notes } = req.body;
    const bid = req.user.role === 'admin' ? branch_id : req.user.branch_id;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (adjustment_type === 'add') {
        await conn.query('UPDATE inventory SET available_qty = available_qty + ? WHERE branch_id = ? AND product_id = ?',
          [quantity, bid, product_id]);
      } else {
        await conn.query('UPDATE inventory SET available_qty = available_qty - ? WHERE branch_id = ? AND product_id = ?',
          [quantity, bid, product_id]);
      }
      await conn.query(
        `INSERT INTO inventory_transactions
         (branch_id, product_id, txn_type, quantity, reference_type, notes, performed_by)
         VALUES (?, ?, 'adjustment', ?, 'adjustment', ?, ?)`,
        [bid, product_id, quantity, notes, req.user.id]
      );
      await conn.commit();
      res.json({ success: true, message: 'Adjustment recorded' });
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  } catch (err) { next(err); }
});

// GET /api/inventory/transactions
router.get('/transactions', async (req, res, next) => {
  try {
    let sql = `SELECT it.*, p.name AS product_name, p.sku, u.name AS performed_by_name
               FROM inventory_transactions it
               JOIN products p ON p.id = it.product_id
               JOIN users u ON u.id = it.performed_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND it.branch_id = ?'; params.push(req.branchId); }
    sql += ' ORDER BY it.created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
