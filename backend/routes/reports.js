const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');

router.use(authenticate, authorize('admin', 'accountant'), branchFilter);

// GET /api/reports/revenue-monthly
router.get('/revenue-monthly', async (req, res, next) => {
  try {
    let sql = `SELECT branch_id, month, total_invoiced, total_collected FROM v_monthly_revenue WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND branch_id = ?'; params.push(req.branchId); }
    sql += ' ORDER BY month DESC LIMIT 12';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/reports/profit-loss
router.get('/profit-loss', async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;
    const start = from_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = to_date || new Date().toISOString().split('T')[0];
    const bp = req.branchId ? [req.branchId, start, end] : [start, end];
    const bw = req.branchId ? 'branch_id = ? AND' : '';

    const [[income]] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM invoices
       WHERE ${bw} invoice_date BETWEEN ? AND ? AND invoice_type = 'invoice'`, bp
    );
    const [expensesByCategory] = await pool.query(
      `SELECT ec.name AS category, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
       WHERE ${bw} e.expense_date BETWEEN ? AND ? AND e.status = 'approved'
       GROUP BY ec.name ORDER BY total DESC`, bp
    );
    const totalExpenses = expensesByCategory.reduce((s, e) => s + parseFloat(e.total), 0);

    res.json({
      success: true,
      data: {
        period: { from: start, to: end },
        income: parseFloat(income.total),
        expenses: expensesByCategory,
        total_expenses: totalExpenses,
        net_profit: parseFloat(income.total) - totalExpenses
      }
    });
  } catch (err) { next(err); }
});

// GET /api/reports/gst
router.get('/gst', async (req, res, next) => {
  try {
    const bp = req.branchId ? [req.branchId] : [];
    const bw = req.branchId ? 'WHERE branch_id = ?' : '';
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(invoice_date, '%Y-%m') AS month,
              SUM(cgst_amount) AS cgst, SUM(sgst_amount) AS sgst,
              SUM(igst_amount) AS igst,
              SUM(cgst_amount + sgst_amount + igst_amount) AS total_tax
       FROM invoices ${bw}
       GROUP BY month ORDER BY month DESC LIMIT 12`, bp
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/reports/cash-flow
router.get('/cash-flow', async (req, res, next) => {
  try {
    const bp = req.branchId ? [req.branchId, req.branchId] : [];
    const bw1 = req.branchId ? 'AND branch_id = ?' : '';
    const bw2 = req.branchId ? 'AND branch_id = ?' : '';

    const [inflow] = await pool.query(
      `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount) AS total
       FROM payments WHERE payment_type = 'incoming' ${bw1}
       GROUP BY month ORDER BY month DESC LIMIT 6`,
      req.branchId ? [req.branchId] : []
    );
    const [outflow] = await pool.query(
      `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount) AS total
       FROM payments WHERE payment_type = 'outgoing' ${bw2}
       GROUP BY month ORDER BY month DESC LIMIT 6`,
      req.branchId ? [req.branchId] : []
    );
    res.json({ success: true, data: { inflow, outflow } });
  } catch (err) { next(err); }
});

// GET /api/reports/sales-by-category
router.get('/sales-by-category', async (req, res, next) => {
  try {
    let sql = `SELECT pc.name AS category, COALESCE(SUM(oi.line_total), 0) AS total_sales
               FROM order_items oi
               JOIN products p ON p.id = oi.product_id
               LEFT JOIN product_categories pc ON pc.id = p.category_id
               JOIN orders o ON o.id = oi.order_id
               WHERE o.status IN ('approved','dispatched','delivered')`;
    const params = [];
    if (req.branchId) { sql += ' AND o.branch_id = ?'; params.push(req.branchId); }
    sql += ' GROUP BY pc.name ORDER BY total_sales DESC';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/reports/order-summary
router.get('/order-summary', async (req, res, next) => {
  try {
    let sql = `SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
               FROM orders WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND branch_id = ?'; params.push(req.branchId); }
    sql += ' GROUP BY status';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
