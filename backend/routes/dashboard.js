const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, branchFilter } = require('../middleware/auth');

router.use(authenticate, branchFilter);

// GET /api/dashboard/admin — admin overview
router.get('/admin', async (req, res, next) => {
  try {
    const [[orderStats]] = await pool.query(
      `SELECT COUNT(*) AS total_orders,
              SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_orders,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_orders,
              SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END) AS dispatched_orders,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
              SUM(total_amount) AS total_revenue
       FROM orders WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`
    );
    const [[invStats]] = await pool.query(
      `SELECT COUNT(*) AS total_products,
              SUM(available_qty) AS total_stock
       FROM inventory`
    );
    const [lowStock] = await pool.query('SELECT COUNT(*) AS count FROM v_low_stock_alerts');
    const [[userStats]] = await pool.query(
      'SELECT COUNT(*) AS total_users FROM users WHERE is_active = TRUE'
    );
    const [branchRevenue] = await pool.query(
      `SELECT b.name AS branch_name, COALESCE(SUM(o.total_amount), 0) AS revenue
       FROM branches b LEFT JOIN orders o ON o.branch_id = b.id AND o.order_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY b.id, b.name`
    );
    res.json({
      success: true,
      data: { orders: orderStats, inventory: invStats, low_stock: lowStock[0]?.count || 0,
              users: userStats, branch_revenue: branchRevenue }
    });
  } catch (err) { next(err); }
});

// GET /api/dashboard/branch-manager — branch-level KPIs
router.get('/branch-manager', async (req, res, next) => {
  try {
    const bid = req.branchId || req.user.branch_id;
    const [[orderStats]] = await pool.query(
      `SELECT COUNT(*) AS total_orders,
              SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(total_amount) AS revenue
       FROM orders WHERE branch_id = ? AND order_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`, [bid]
    );
    const [[transferStats]] = await pool.query(
      `SELECT COUNT(*) AS pending_transfers
       FROM transfers WHERE (from_branch_id = ? OR to_branch_id = ?) AND status = 'pending'`,
      [bid, bid]
    );
    const [lowStock] = await pool.query(
      'SELECT * FROM v_low_stock_alerts WHERE branch_id = ?', [bid]
    );
    const [recentOrders] = await pool.query(
      `SELECT o.order_no, c.name AS customer_name, o.total_amount, o.status, o.order_date
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.branch_id = ? ORDER BY o.created_at DESC LIMIT 5`, [bid]
    );
    res.json({
      success: true,
      data: { orders: orderStats, transfers: transferStats, low_stock: lowStock, recent_orders: recentOrders }
    });
  } catch (err) { next(err); }
});

// GET /api/dashboard/sales — sales panel KPIs
router.get('/sales', async (req, res, next) => {
  try {
    const bid = req.branchId || req.user.branch_id;
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS today_orders,
              SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS ready_dispatch
       FROM orders WHERE branch_id = ? AND order_date = CURDATE()`, [bid]
    );
    const [lowStock] = await pool.query(
      'SELECT COUNT(*) AS count FROM v_low_stock_alerts WHERE branch_id = ?', [bid]
    );
    res.json({ success: true, data: { ...stats, low_stock: lowStock[0]?.count || 0 } });
  } catch (err) { next(err); }
});

// GET /api/dashboard/accountant — financial KPIs
router.get('/accountant', async (req, res, next) => {
  try {
    const bid = req.branchId || req.user.branch_id;
    let invoiceFilter = '1=1', expenseFilter = '1=1', payFilter = '1=1';
    const params1 = [], params2 = [], params3 = [];
    if (bid) { invoiceFilter = 'inv.branch_id = ?'; params1.push(bid);
               expenseFilter = 'e.branch_id = ?'; params2.push(bid);
               payFilter = 'p.branch_id = ?'; params3.push(bid); }

    const [[revenue]] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM invoices inv
       WHERE ${invoiceFilter} AND MONTH(invoice_date) = MONTH(CURDATE()) AND YEAR(invoice_date) = YEAR(CURDATE())`, params1
    );
    const [[directExpenses]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses e
       WHERE ${expenseFilter} AND MONTH(expense_date) = MONTH(CURDATE()) AND YEAR(expense_date) = YEAR(CURDATE())`, params2
    );
    const [[purchaseExpenses]] = await pool.query(
       `SELECT COALESCE(SUM(total_amount), 0) AS total FROM purchase_bills pb
        WHERE ${bid ? 'pb.branch_id = ?' : '1=1'} AND MONTH(bill_date) = MONTH(CURDATE()) AND YEAR(bill_date) = YEAR(CURDATE())`, 
        bid ? [bid] : []
    );
    const totalExpenses = Number(directExpenses.total) + Number(purchaseExpenses.total);
    const [[receivable]] = await pool.query(
      `SELECT COALESCE(SUM(balance_amount), 0) AS total FROM invoices inv
       WHERE ${invoiceFilter} AND payment_status IN ('unpaid','partial','overdue')`, params1
    );
    const [[payable]] = await pool.query(
      `SELECT COALESCE(SUM(total_amount - paid_amount), 0) AS total FROM purchase_bills pb
       WHERE ${bid ? 'pb.branch_id = ?' : '1=1'} AND payment_status IN ('unpaid','partial','overdue')`,
      bid ? [bid] : []
    );
    const [[overdue]] = await pool.query(
      `SELECT COUNT(*) AS count FROM invoices inv
       WHERE ${invoiceFilter} AND payment_status = 'overdue'`, params1
    );

    // 6 Month Trend Data (Mocked historical logic for missing months)
    const chartLabels = [];
    const incomeData = [];
    const expenseData = [];
    for(let i=5; i>=0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const mLabel = d.toLocaleString('default', { month: 'short' });
      chartLabels.push(mLabel);
      
      // For current month, use real totals. For others, keep 0 or small mock values if first launch
      if (i === 0) {
        incomeData.push(revenue.total);
        expenseData.push(totalExpenses);
      } else {
        incomeData.push(0); expenseData.push(0);
      }
    }

    res.json({
      success: true,
      data: { 
        revenue: revenue.total, 
        expenses: totalExpenses,
        receivable: receivable.total, 
        payable: payable.total,
        overdue_count: overdue.count,
        chart: { labels: chartLabels, income: incomeData, expenses: expenseData }
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
