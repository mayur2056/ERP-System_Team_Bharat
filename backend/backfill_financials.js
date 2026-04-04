const mysql = require('mysql2/promise');

async function backfill() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'super',
    database: 'shivam_erp'
  });

  try {
    console.log('--- Starting Backfill of Financial Records ---');

    // 1. Backfill INVOICES from existing ORDERS
    const [orders] = await pool.query(`
      SELECT o.*, c.name AS customer_name 
      FROM orders o 
      JOIN customers c ON c.id = o.customer_id
      WHERE o.status IN ('approved', 'dispatched', 'delivered')
      AND NOT EXISTS (SELECT 1 FROM invoices WHERE order_id = o.id)
    `);

    console.log(`Found ${orders.length} orders requiring invoices.`);
    for (const o of orders) {
      const invNo = 'INV-BK-' + o.id.toString().padStart(4, '0');
      await pool.query(
        `INSERT INTO invoices (invoice_no, branch_id, order_id, customer_id, created_by, 
         invoice_date, due_date, subtotal, cgst_amount, sgst_amount, total_amount, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL 15 DAY), ?, ?, ?, ?, 'unpaid')`,
        [invNo, o.branch_id, o.id, o.customer_id, o.created_by, o.order_date, o.order_date, o.total_amount * 0.82, o.total_amount * 0.09, o.total_amount * 0.09, o.total_amount]
      );
      console.log(`Generated Invoice ${invNo} for Order ${o.order_no}`);
    }

    // 2. Backfill PURCHASE BILLS from existing INVENTORY_TRANSACTIONS (stock_in)
    const [stEntries] = await pool.query(`
      SELECT it.*, p.name AS product_name, p.base_price
      FROM inventory_transactions it
      JOIN products p ON p.id = it.product_id
      WHERE it.txn_type = 'stock_in'
      AND it.reference_type = 'purchase'
    `);

    console.log(`Found ${stEntries.length} stock receipts requiring purchase bills.`);
    // Get a default vendor if none exists
    const [vendors] = await pool.query('SELECT id FROM vendors LIMIT 1');
    const defaultVendorId = vendors[0]?.id || 1;

    for (const st of stEntries) {
      const billNo = 'BILL-BK-' + st.id.toString().padStart(4, '0');
      const totalAmount = st.quantity * (st.base_price * 0.8); // Estimate cost as 80% of retail if not logged
      
      await pool.query(
        `INSERT INTO purchase_bills (bill_no, branch_id, vendor_id, created_by, 
         bill_date, due_date, subtotal, gst_amount, total_amount, payment_status)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(?, INTERVAL 30 DAY), ?, ?, ?, 'unpaid')`,
        [billNo, st.branch_id, defaultVendorId, st.performed_by, st.created_at, st.created_at, totalAmount * 0.82, totalAmount * 0.18, totalAmount]
      );
      console.log(`Generated Purchase Bill ${billNo} for Stock Transaction ${st.id}`);
    }

    console.log('--- Backfill Complete ---');
    process.exit(0);
  } catch (err) {
    console.error('Backfill Error:', err);
    process.exit(1);
  }
}

backfill();
