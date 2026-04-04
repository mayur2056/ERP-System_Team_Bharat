-- ============================================================
-- SHIVAM ENTERPRISES ERP - COMPLETE SQL DATABASE SCHEMA
-- Branches: Pune & Kolhapur
-- Roles: Admin, Branch Manager, Sales/Warehouse, Accountant
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP DATABASE IF EXISTS shivam_erp;
CREATE DATABASE shivam_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shivam_erp;

-- ============================================================
-- 1. CORE: BRANCHES
-- ============================================================
CREATE TABLE branches (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,                 -- e.g. "Pune", "Kolhapur"
  address     TEXT,
  city        VARCHAR(100),
  state       VARCHAR(100),
  pincode     VARCHAR(10),
  phone       VARCHAR(20),
  gstin       VARCHAR(20),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO branches (name, city, state, pincode, phone, gstin) VALUES
  ('Pune Branch',     'Pune',     'Maharashtra', '411001', '+91-20-12345678', '27AABCS1234A1Z5'),
  ('Kolhapur Branch', 'Kolhapur', 'Maharashtra', '416001', '+91-231-1234567', '27AABCS1234A1Z6');

-- ============================================================
-- 2. CORE: USERS & ROLES
-- ============================================================
CREATE TABLE roles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        ENUM('admin','branch_manager','sales_warehouse','accountant') UNIQUE NOT NULL,
  description VARCHAR(255)
);

INSERT INTO roles (name, description) VALUES
  ('admin',            'Super Admin – full system access'),
  ('branch_manager',   'Branch Manager – manages a single branch'),
  ('sales_warehouse',  'Sales & Warehouse – orders, inventory, dispatch'),
  ('accountant',       'Accountant – invoices, payments, ledger');

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,              -- bcrypt hash
  role_id       INT NOT NULL,
  branch_id     INT NULL,                           -- NULL for admin (global)
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id)   REFERENCES roles(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Seed users (passwords are bcrypt of "Password@123")
INSERT INTO users (name, email, password_hash, role_id, branch_id) VALUES
  ('Shivam Admin',      'admin@shivamenterprise.com',       '$2b$10$PLACEHOLDER_ADMIN',  1, NULL),
  ('Pune BM',           'bm.pune@shivamenterprise.com',     '$2b$10$PLACEHOLDER_BMP',   2, 1),
  ('Kolhapur BM',       'bm.kolhapur@shivamenterprise.com', '$2b$10$PLACEHOLDER_BMK',   2, 2),
  ('Pune Sales',        'sales.pune@shivamenterprise.com',  '$2b$10$PLACEHOLDER_SP',    3, 1),
  ('Kolhapur Sales',    'sales.kolhapur@shivamenterprise.com','$2b$10$PLACEHOLDER_SK',  3, 2),
  ('Pune Accountant',   'acc.pune@shivamenterprise.com',    '$2b$10$PLACEHOLDER_AP',    4, 1),
  ('Kolhapur Accountant','acc.kolhapur@shivamenterprise.com','$2b$10$PLACEHOLDER_AK',   4, 2);

-- ============================================================
-- 3. PRODUCTS / CATALOGUE
-- ============================================================
CREATE TABLE product_categories (
  id    INT AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) UNIQUE NOT NULL   -- Cables, Switchgear, Lighting, Panels, Power, Accessories
);

INSERT INTO product_categories (name) VALUES
  ('Cables'), ('Switchgear'), ('Lighting'), ('Panels'), ('Power'), ('Accessories');

CREATE TABLE products (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  sku           VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(200) NOT NULL,
  category_id   INT,
  brand         VARCHAR(100),
  unit          ENUM('Meters','Pcs','Kg','Box','Roll') DEFAULT 'Pcs',
  base_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  gst_rate      DECIMAL(5,2) NOT NULL DEFAULT 18.00,   -- % e.g. 18
  hsn_code      VARCHAR(20),
  description   TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES product_categories(id)
);

-- ============================================================
-- 4. INVENTORY (per branch)
-- ============================================================
CREATE TABLE inventory (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  branch_id       INT NOT NULL,
  product_id      INT NOT NULL,
  available_qty   DECIMAL(12,2) NOT NULL DEFAULT 0,
  reserved_qty    DECIMAL(12,2) NOT NULL DEFAULT 0,   -- locked for pending orders
  min_stock_level DECIMAL(12,2) NOT NULL DEFAULT 0,   -- reorder point
  rack_location   VARCHAR(50),
  last_updated    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_product (branch_id, product_id),
  FOREIGN KEY (branch_id)  REFERENCES branches(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Every stock movement is logged
CREATE TABLE inventory_transactions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  branch_id       INT NOT NULL,
  product_id      INT NOT NULL,
  txn_type        ENUM('stock_in','stock_out','reserved','unreserved','adjustment','transfer_out','transfer_in') NOT NULL,
  quantity        DECIMAL(12,2) NOT NULL,
  reference_type  ENUM('purchase','order','transfer','adjustment','dispatch') DEFAULT NULL,
  reference_id    INT DEFAULT NULL,   -- FK to orders/transfers etc (denormalised for flexibility)
  notes           TEXT,
  performed_by    INT NOT NULL,       -- user_id
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (product_id)  REFERENCES products(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- ============================================================
-- 5. CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  branch_id       INT NOT NULL,           -- owning branch
  name            VARCHAR(200) NOT NULL,
  type            ENUM('Dealer','Distributor','Retail','Corporate') DEFAULT 'Retail',
  contact_person  VARCHAR(100),
  phone           VARCHAR(20),
  email           VARCHAR(150),
  address         TEXT,
  city            VARCHAR(100),
  state           VARCHAR(100),
  gstin           VARCHAR(20),
  credit_limit    DECIMAL(14,2) DEFAULT 0,
  outstanding_amt DECIMAL(14,2) DEFAULT 0,  -- updated on invoice/payment
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============================================================
-- 6. VENDORS (for purchases tracked by accountant)
-- ============================================================
CREATE TABLE vendors (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  contact_person  VARCHAR(100),
  phone           VARCHAR(20),
  email           VARCHAR(150),
  address         TEXT,
  gstin           VARCHAR(20),
  credit_terms    INT DEFAULT 30,   -- days
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. ORDERS
-- ============================================================
CREATE TABLE orders (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  order_no        VARCHAR(30) UNIQUE NOT NULL,   -- ORD-YYYY-NNNN
  branch_id       INT NOT NULL,
  customer_id     INT NOT NULL,
  created_by      INT NOT NULL,                  -- sales user
  approved_by     INT DEFAULT NULL,              -- branch manager
  status          ENUM('draft','pending_approval','approved','rejected','dispatched','delivered','cancelled') DEFAULT 'draft',
  priority        ENUM('low','medium','high') DEFAULT 'medium',
  order_date      DATE NOT NULL,
  expected_date   DATE,
  subtotal        DECIMAL(14,2) DEFAULT 0,
  gst_amount      DECIMAL(14,2) DEFAULT 0,
  total_amount    DECIMAL(14,2) DEFAULT 0,
  notes           TEXT,
  rejection_reason TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by)  REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  product_id  INT NOT NULL,
  quantity    DECIMAL(12,2) NOT NULL,
  unit_price  DECIMAL(12,2) NOT NULL,
  gst_rate    DECIMAL(5,2) NOT NULL DEFAULT 18,
  gst_amount  DECIMAL(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_price * gst_rate / 100, 2)) STORED,
  line_total  DECIMAL(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_price * (1 + gst_rate/100), 2)) STORED,
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================================
-- 8. INTER-BRANCH TRANSFERS
-- ============================================================
CREATE TABLE transfers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  transfer_no     VARCHAR(30) UNIQUE NOT NULL,   -- TRF-YYYY-NNNN
  from_branch_id  INT NOT NULL,
  to_branch_id    INT NOT NULL,
  requested_by    INT NOT NULL,   -- sales/warehouse user
  approved_by_from INT DEFAULT NULL,  -- from-branch manager
  approved_by_to   INT DEFAULT NULL,  -- to-branch manager (receiving confirmation)
  status          ENUM('pending','approved','in_transit','received','rejected') DEFAULT 'pending',
  request_date    DATE NOT NULL,
  dispatch_date   DATE,
  received_date   DATE,
  notes           TEXT,
  rejection_reason TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_branch_id)   REFERENCES branches(id),
  FOREIGN KEY (to_branch_id)     REFERENCES branches(id),
  FOREIGN KEY (requested_by)     REFERENCES users(id),
  FOREIGN KEY (approved_by_from) REFERENCES users(id),
  FOREIGN KEY (approved_by_to)   REFERENCES users(id)
);

CREATE TABLE transfer_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  transfer_id INT NOT NULL,
  product_id  INT NOT NULL,
  quantity    DECIMAL(12,2) NOT NULL,
  received_qty DECIMAL(12,2) DEFAULT NULL,   -- filled on receipt
  FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id)  REFERENCES products(id)
);

-- ============================================================
-- 9. DISPATCH
-- ============================================================
CREATE TABLE dispatches (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  dispatch_no     VARCHAR(30) UNIQUE NOT NULL,   -- DSP-YYYY-NNNN
  order_id        INT NOT NULL,
  branch_id       INT NOT NULL,
  dispatched_by   INT NOT NULL,
  driver_name     VARCHAR(100),
  vehicle_no      VARCHAR(30),
  dispatch_date   DATE NOT NULL,
  expected_delivery DATE,
  actual_delivery DATE,
  status          ENUM('prepared','dispatched','in_transit','delivered','returned') DEFAULT 'prepared',
  delivery_notes  TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)      REFERENCES orders(id),
  FOREIGN KEY (branch_id)     REFERENCES branches(id),
  FOREIGN KEY (dispatched_by) REFERENCES users(id)
);

-- ============================================================
-- 10. INVOICES
-- ============================================================
CREATE TABLE invoices (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no      VARCHAR(30) UNIQUE NOT NULL,  -- INV-YYYY-NNNN
  invoice_type    ENUM('invoice','credit_note','debit_note') DEFAULT 'invoice',
  branch_id       INT NOT NULL,
  order_id        INT DEFAULT NULL,             -- linked order
  customer_id     INT NOT NULL,
  created_by      INT NOT NULL,                 -- accountant
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0,
  cgst_amount     DECIMAL(14,2) DEFAULT 0,
  sgst_amount     DECIMAL(14,2) DEFAULT 0,
  igst_amount     DECIMAL(14,2) DEFAULT 0,
  total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount     DECIMAL(14,2) DEFAULT 0,
  balance_amount  DECIMAL(14,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  payment_status  ENUM('unpaid','partial','paid','overdue') DEFAULT 'unpaid',
  payment_mode    ENUM('bank','cheque','cash','upi','credit','neft','rtgs') DEFAULT 'bank',
  gstn_amount     DECIMAL(14,2) DEFAULT 0,
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (order_id)    REFERENCES orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by)  REFERENCES users(id)
);

-- ============================================================
-- 11. PURCHASE BILLS (vendor bills managed by accountant)
-- ============================================================
CREATE TABLE purchase_bills (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  bill_no         VARCHAR(30) UNIQUE NOT NULL,   -- BILL-YYYY-NNNN
  branch_id       INT NOT NULL,
  vendor_id       INT NOT NULL,
  created_by      INT NOT NULL,
  bill_date       DATE NOT NULL,
  due_date        DATE NOT NULL,
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0,
  gst_amount      DECIMAL(14,2) DEFAULT 0,
  total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount     DECIMAL(14,2) DEFAULT 0,
  payment_status  ENUM('unpaid','partial','paid','overdue') DEFAULT 'unpaid',
  payment_mode    ENUM('bank','cheque','cash','upi','neft','rtgs') DEFAULT 'bank',
  po_reference    VARCHAR(30),
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================================
-- 12. PAYMENTS (incoming from customers / outgoing to vendors)
-- ============================================================
CREATE TABLE payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  payment_no      VARCHAR(30) UNIQUE NOT NULL,   -- PAY-YYYY-NNNN
  branch_id       INT NOT NULL,
  payment_type    ENUM('incoming','outgoing') NOT NULL,
  party_type      ENUM('customer','vendor') NOT NULL,
  party_id        INT NOT NULL,    -- customer_id or vendor_id
  reference_type  ENUM('invoice','bill','expense','advance') DEFAULT 'invoice',
  reference_id    INT DEFAULT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  payment_mode    ENUM('bank','cheque','cash','upi','neft','rtgs') NOT NULL,
  payment_date    DATE NOT NULL,
  status          ENUM('pending','completed','failed','reversed') DEFAULT 'completed',
  recorded_by     INT NOT NULL,
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

-- ============================================================
-- 13. EXPENSES
-- ============================================================
CREATE TABLE expense_categories (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

INSERT INTO expense_categories (name) VALUES
  ('Purchase'),('Transport'),('Salary'),('Rent'),
  ('Utilities'),('Marketing'),('Misc');

CREATE TABLE expenses (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  expense_no      VARCHAR(30) UNIQUE NOT NULL,    -- EXP-YYYY-NNNN
  branch_id       INT NOT NULL,
  category_id     INT NOT NULL,
  vendor_name     VARCHAR(200),
  amount          DECIMAL(14,2) NOT NULL,
  payment_mode    ENUM('bank','cheque','cash','upi','neft','rtgs') DEFAULT 'cash',
  expense_date    DATE NOT NULL,
  reference_no    VARCHAR(50),
  status          ENUM('pending','approved','rejected') DEFAULT 'pending',
  approved_by     INT DEFAULT NULL,
  recorded_by     INT NOT NULL,
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

-- ============================================================
-- 14. JOURNAL / LEDGER (double-entry bookkeeping)
-- ============================================================
CREATE TABLE ledger_accounts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,    -- e.g. 1001, 2001
  name        VARCHAR(200) NOT NULL,
  type        ENUM('asset','liability','equity','revenue','expense') NOT NULL,
  branch_id   INT DEFAULT NULL,              -- NULL = global
  is_active   BOOLEAN DEFAULT TRUE
);

INSERT INTO ledger_accounts (code, name, type) VALUES
  ('1001', 'Cash',                  'asset'),
  ('1002', 'Bank Account',          'asset'),
  ('1101', 'Accounts Receivable',   'asset'),
  ('1201', 'Inventory',             'asset'),
  ('2001', 'Accounts Payable',      'liability'),
  ('2101', 'GST Payable',           'liability'),
  ('3001', 'Capital',               'equity'),
  ('4001', 'Sales Revenue',         'revenue'),
  ('5001', 'Cost of Goods Sold',    'expense'),
  ('5101', 'Salaries',              'expense'),
  ('5201', 'Rent',                  'expense'),
  ('5301', 'Transport',             'expense'),
  ('5401', 'Utilities',             'expense'),
  ('5501', 'Marketing',             'expense'),
  ('5999', 'Miscellaneous Expense', 'expense');

CREATE TABLE journal_entries (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  journal_no      VARCHAR(30) UNIQUE NOT NULL,
  branch_id       INT NOT NULL,
  entry_date      DATE NOT NULL,
  narration       TEXT,
  reference_type  VARCHAR(50),
  reference_id    INT,
  created_by      INT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)  REFERENCES branches(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE journal_entry_lines (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  journal_id      INT NOT NULL,
  account_id      INT NOT NULL,
  debit_amount    DECIMAL(14,2) DEFAULT 0,
  credit_amount   DECIMAL(14,2) DEFAULT 0,
  FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES ledger_accounts(id)
);

-- ============================================================
-- 15. NOTIFICATIONS / ALERTS
-- ============================================================
CREATE TABLE notifications (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  recipient_id    INT NOT NULL,               -- user_id
  branch_id       INT DEFAULT NULL,
  type            ENUM('order_pending','order_approved','order_rejected',
                        'low_stock','transfer_request','transfer_approved',
                        'transfer_received','invoice_due','payment_received',
                        'expense_pending','dispatch_update') NOT NULL,
  title           VARCHAR(200) NOT NULL,
  message         TEXT,
  reference_type  VARCHAR(50),
  reference_id    INT,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_id) REFERENCES users(id),
  FOREIGN KEY (branch_id)    REFERENCES branches(id)
);

-- ============================================================
-- 16. SYSTEM SEQUENCES (for auto-numbering)
-- ============================================================
CREATE TABLE sequences (
  prefix VARCHAR(10) PRIMARY KEY,
  last_val INT NOT NULL DEFAULT 0
);

INSERT INTO sequences (prefix, last_val) VALUES
  ('ORD', 1000),
  ('TRF', 100),
  ('DSP', 500),
  ('INV', 2000),
  ('BILL', 40),
  ('PAY', 500),
  ('EXP', 270),
  ('JRN', 100);

-- ============================================================
-- VIEWS (used by dashboards)
-- ============================================================

-- Admin: cross-branch order summary
CREATE VIEW v_order_summary AS
SELECT
  o.id, o.order_no, o.branch_id, b.name AS branch_name,
  o.customer_id, c.name AS customer_name,
  o.status, o.priority, o.total_amount,
  o.order_date, o.created_by,
  u.name AS created_by_name
FROM orders o
JOIN branches b  ON b.id = o.branch_id
JOIN customers c ON c.id = o.customer_id
JOIN users u     ON u.id = o.created_by;

-- Low stock alert view
CREATE VIEW v_low_stock_alerts AS
SELECT
  i.branch_id, b.name AS branch_name,
  p.id AS product_id, p.sku, p.name AS product_name,
  p.unit, i.available_qty, i.min_stock_level,
  (i.min_stock_level - i.available_qty) AS shortage_qty
FROM inventory i
JOIN branches b  ON b.id = i.branch_id
JOIN products p  ON p.id = i.product_id
WHERE i.available_qty < i.min_stock_level;

-- Accountant: receivables aging
CREATE VIEW v_receivables AS
SELECT
  inv.branch_id, b.name AS branch_name,
  inv.invoice_no, inv.customer_id, c.name AS customer_name,
  inv.total_amount, inv.paid_amount, inv.balance_amount,
  inv.due_date, inv.payment_status,
  DATEDIFF(CURDATE(), inv.due_date) AS days_overdue
FROM invoices inv
JOIN branches b  ON b.id = inv.branch_id
JOIN customers c ON c.id = inv.customer_id
WHERE inv.payment_status IN ('unpaid','partial','overdue');

-- Monthly revenue by branch
CREATE VIEW v_monthly_revenue AS
SELECT
  branch_id,
  DATE_FORMAT(invoice_date, '%Y-%m') AS month,
  SUM(total_amount) AS total_invoiced,
  SUM(paid_amount)  AS total_collected
FROM invoices
WHERE invoice_type = 'invoice'
GROUP BY branch_id, month;



-- ============================================================
-- STORED PROCEDURE: Get Next Sequence Number
-- ============================================================

DROP PROCEDURE IF EXISTS get_next_seq;

DELIMITER $$

CREATE PROCEDURE get_next_seq(
  IN p_prefix VARCHAR(10),
  OUT p_number VARCHAR(30)
)
BEGIN
  DECLARE yr CHAR(4);
  DECLARE next_val INT;

  SET yr = YEAR(CURDATE());

  UPDATE sequences 
  SET last_val = last_val + 1 
  WHERE prefix = p_prefix;

  SELECT last_val INTO next_val 
  FROM sequences 
  WHERE prefix = p_prefix;

  IF next_val IS NULL THEN
    SET p_number = NULL;
  ELSE
    SET p_number = CONCAT(p_prefix, '-', yr, '-', LPAD(next_val, 4, '0'));
  END IF;

END$$


-- ============================================================
-- TRIGGERS: Auto-update inventory on order approval
-- ============================================================

DROP TRIGGER IF EXISTS trg_order_approved$$

CREATE TRIGGER trg_order_approved
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN

  IF OLD.status != 'approved' AND NEW.status = 'approved' THEN

    UPDATE inventory i
    JOIN order_items oi ON oi.product_id = i.product_id
    SET
      i.available_qty = i.available_qty - oi.quantity,
      i.reserved_qty  = i.reserved_qty + oi.quantity
    WHERE oi.order_id = NEW.id
      AND i.branch_id = NEW.branch_id
      AND i.available_qty >= oi.quantity;

  END IF;

  IF OLD.status = 'approved' AND NEW.status IN ('rejected','cancelled') THEN

    UPDATE inventory i
    JOIN order_items oi ON oi.product_id = i.product_id
    SET
      i.available_qty = i.available_qty + oi.quantity,
      i.reserved_qty  = i.reserved_qty - oi.quantity
    WHERE oi.order_id = NEW.id
      AND i.branch_id = NEW.branch_id;

  END IF;

END$$


-- ============================================================
-- DISPATCH TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS trg_dispatch_created$$

CREATE TRIGGER trg_dispatch_created
AFTER INSERT ON dispatches
FOR EACH ROW
BEGIN

  UPDATE inventory i
  JOIN order_items oi ON oi.product_id = i.product_id
  SET i.reserved_qty = i.reserved_qty - oi.quantity
  WHERE oi.order_id = NEW.order_id
    AND i.branch_id = NEW.branch_id;

END$$


-- ============================================================
-- INVOICE TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS trg_invoice_created$$

CREATE TRIGGER trg_invoice_created
AFTER INSERT ON invoices
FOR EACH ROW
BEGIN

  UPDATE customers
  SET outstanding_amt = outstanding_amt + NEW.total_amount
  WHERE id = NEW.customer_id;

END$$


-- ============================================================
-- PAYMENT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS trg_payment_recorded$$

CREATE TRIGGER trg_payment_recorded
AFTER INSERT ON payments
FOR EACH ROW
BEGIN

  IF NEW.payment_type = 'incoming' AND NEW.party_type = 'customer' THEN

    UPDATE invoices
    SET paid_amount = paid_amount + NEW.amount
    WHERE id = NEW.reference_id 
      AND NEW.reference_type = 'invoice';

    UPDATE invoices
    SET payment_status = CASE
      WHEN paid_amount >= total_amount THEN 'paid'
      WHEN paid_amount > 0 THEN 'partial'
      ELSE 'unpaid'
    END
    WHERE id = NEW.reference_id;

    UPDATE customers
    SET outstanding_amt = outstanding_amt - NEW.amount
    WHERE id = NEW.party_id;

  END IF;

END$$

DELIMITER ;


SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- END OF SCHEMA
-- ============================================================

show tables;



