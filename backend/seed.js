/**
 * Seed Script — Run after SQL schema is imported
 * Usage: node seed.js
 * 
 * This script:
 * 1. Hashes passwords for all seeded users (replaces PLACEHOLDER hashes)
 * 2. Inserts sample products with proper categories
 * 3. Inserts inventory records for both branches
 * 4. Inserts sample customers
 * 5. Inserts sample vendors
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function seed() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'shivam_erp'
  });

  console.log('🌱 Starting seed...');

  // ── 1. Hash passwords ────────────────────────────────
  const password = 'Password@123';
  const hash = await bcrypt.hash(password, 10);
  console.log('🔐 Hashing passwords...');
  await pool.query('UPDATE users SET password_hash = ?', [hash]);
  console.log('   ✅ All users now have password: Password@123');

  // ── 2. Products ──────────────────────────────────────
  console.log('📦 Inserting products...');
  const products = [
    // Cables (category_id = 1)
    ['CAB-001', 'Copper Cable 2.5mm', 1, 'Polycab', 'Meters', 85.00, 18, '8544'],
    ['CAB-002', 'Armoured Cable 4mm', 1, 'Havells', 'Meters', 210.00, 18, '8544'],
    ['CAB-003', 'Flexible Wire 1mm', 1, 'Polycab', 'Meters', 35.00, 18, '8544'],
    ['CAB-004', 'Coaxial Cable RG6', 1, 'Havells', 'Meters', 22.00, 18, '8544'],
    ['CAB-005', 'XLPE Cable 10mm', 1, 'Polycab', 'Meters', 380.00, 18, '8544'],
    // Switchgear (category_id = 2)
    ['SWG-001', 'MCB 32A SP', 2, 'Schneider Electric', 'Pcs', 320.00, 18, '8536'],
    ['SWG-002', 'MCCB 100A 3P', 2, 'Siemens', 'Pcs', 4500.00, 18, '8536'],
    ['SWG-003', 'RCCB 40A 2P 30mA', 2, 'Legrand', 'Pcs', 1800.00, 18, '8536'],
    ['SWG-004', 'Changeover Switch 63A', 2, 'ABB', 'Pcs', 2200.00, 18, '8536'],
    ['SWG-005', 'Contactor 25A 3P', 2, 'Schneider Electric', 'Pcs', 1500.00, 18, '8536'],
    // Lighting (category_id = 3)
    ['LGT-001', 'LED Panel Light 18W', 3, 'Havells', 'Pcs', 450.00, 18, '9405'],
    ['LGT-002', 'Street Light 100W', 3, 'Havells', 'Pcs', 3200.00, 18, '9405'],
    ['LGT-003', 'LED Bulb 9W', 3, 'Havells', 'Pcs', 85.00, 18, '9405'],
    ['LGT-004', 'Tube Light 20W', 3, 'Havells', 'Pcs', 220.00, 18, '9405'],
    ['LGT-005', 'Flood Light 50W', 3, 'Legrand', 'Pcs', 1800.00, 18, '9405'],
    // Panels (category_id = 4)
    ['PNL-001', 'Distribution Board 8-Way', 4, 'Siemens', 'Pcs', 2800.00, 18, '8537'],
    ['PNL-002', 'Distribution Board 12-Way', 4, 'Schneider Electric', 'Pcs', 4200.00, 18, '8537'],
    ['PNL-003', 'MCC Panel', 4, 'ABB', 'Pcs', 18000.00, 18, '8537'],
    ['PNL-004', 'APFC Panel 50KVAR', 4, 'Siemens', 'Pcs', 45000.00, 18, '8537'],
    // Power (category_id = 5)
    ['PWR-001', 'UPS 1KVA', 5, 'ABB', 'Pcs', 8500.00, 18, '8504'],
    ['PWR-002', 'Stabilizer 5KVA', 5, 'Siemens', 'Pcs', 12000.00, 18, '8504'],
    ['PWR-003', 'Inverter 2KVA', 5, 'ABB', 'Pcs', 15000.00, 18, '8504'],
    // Accessories (category_id = 6)
    ['ACC-001', 'Cable Tie 300mm', 6, 'Legrand', 'Box', 120.00, 18, '3926'],
    ['ACC-002', 'PVC Conduit 25mm', 6, 'Havells', 'Meters', 45.00, 18, '3917'],
    ['ACC-003', 'Junction Box', 6, 'Legrand', 'Pcs', 180.00, 18, '8538'],
    ['ACC-004', 'Cable Gland PG11', 6, 'ABB', 'Pcs', 65.00, 18, '7307'],
  ];

  for (const p of products) {
    try {
      await pool.query(
        `INSERT INTO products (sku, name, category_id, brand, unit, base_price, gst_rate, hsn_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        p
      );
    } catch (e) { /* skip duplicates */ }
  }
  console.log(`   ✅ ${products.length} products seeded`);

  // ── 3. Inventory for both branches ───────────────────
  console.log('📊 Inserting inventory...');
  const [prods] = await pool.query('SELECT id, sku FROM products');
  const puneId = 1, kolhapurId = 2;

  const invData = {
    'CAB-001': [450, 300], 'CAB-002': [120, 80], 'CAB-003': [600, 400],
    'CAB-004': [200, 150], 'CAB-005': [50, 30],
    'SWG-001': [25, 40],   'SWG-002': [15, 10],  'SWG-003': [20, 15],
    'SWG-004': [8, 5],     'SWG-005': [12, 8],
    'LGT-001': [200, 150], 'LGT-002': [3, 5],    'LGT-003': [500, 400],
    'LGT-004': [100, 80],  'LGT-005': [10, 8],
    'PNL-001': [8, 6],     'PNL-002': [5, 3],     'PNL-003': [2, 1],
    'PNL-004': [1, 0],
    'PWR-001': [0, 3],     'PWR-002': [4, 2],     'PWR-003': [3, 2],
    'ACC-001': [500, 300],  'ACC-002': [800, 600], 'ACC-003': [50, 40],
    'ACC-004': [100, 80],
  };

  const minStocks = {
    'CAB-001': 50, 'CAB-002': 20, 'CAB-003': 100, 'CAB-004': 30, 'CAB-005': 10,
    'SWG-001': 30, 'SWG-002': 5, 'SWG-003': 10, 'SWG-004': 3, 'SWG-005': 5,
    'LGT-001': 50, 'LGT-002': 5, 'LGT-003': 100, 'LGT-004': 20, 'LGT-005': 5,
    'PNL-001': 5, 'PNL-002': 3, 'PNL-003': 2, 'PNL-004': 1,
    'PWR-001': 3, 'PWR-002': 2, 'PWR-003': 2,
    'ACC-001': 100, 'ACC-002': 200, 'ACC-003': 20, 'ACC-004': 30,
  };

  for (const prod of prods) {
    const qtys = invData[prod.sku];
    if (!qtys) continue;
    const minStock = minStocks[prod.sku] || 10;
    await pool.query(
      `INSERT INTO inventory (branch_id, product_id, available_qty, min_stock_level)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE available_qty = VALUES(available_qty)`,
      [puneId, prod.id, qtys[0], minStock]
    );
    await pool.query(
      `INSERT INTO inventory (branch_id, product_id, available_qty, min_stock_level)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE available_qty = VALUES(available_qty)`,
      [kolhapurId, prod.id, qtys[1], minStock]
    );
  }
  console.log('   ✅ Inventory seeded for Pune & Kolhapur');

  // ── 4. Customers ─────────────────────────────────────
  console.log('👥 Inserting customers...');
  const customers = [
    [1, 'Raj Electricals', 'Dealer', 'Raj Sharma', '+91-9876543210', 'raj@electric.com', 'Pune', 'Maharashtra', '27AADCR1234A1Z1', 50000],
    [1, 'Patil Traders', 'Distributor', 'Anil Patil', '+91-9876543211', 'patil@traders.com', 'Pune', 'Maharashtra', '27AADCP1234A1Z2', 80000],
    [1, 'Shree Hardware', 'Retail', 'Suresh Joshi', '+91-9876543212', 'shree@hw.com', 'Pune', 'Maharashtra', '27AADCS1234A1Z3', 25000],
    [1, 'Deshmukh Electric', 'Corporate', 'Vijay Deshmukh', '+91-9876543213', 'desh@elec.com', 'Pune', 'Maharashtra', '27AADCD1234A1Z4', 100000],
    [1, 'Modern Lights', 'Dealer', 'Amit Kumar', '+91-9876543214', 'info@modernlights.com', 'Mumbai', 'Maharashtra', '27AADCM1234A1Z5', 60000],
    [2, 'Krishna Electricals', 'Dealer', 'Krishna Kulkarni', '+91-9876543220', 'krishna@elec.com', 'Kolhapur', 'Maharashtra', '27AADCK1234A1Z6', 40000],
    [2, 'Mahalaxmi Traders', 'Distributor', 'Ramesh Patil', '+91-9876543221', 'mahal@traders.com', 'Kolhapur', 'Maharashtra', '27AADCL1234A1Z7', 70000],
    [2, 'City Wiring Co.', 'Corporate', 'Sanjay More', '+91-9876543222', 'city@wiring.com', 'Kolhapur', 'Maharashtra', '27AADCC1234A1Z8', 90000],
  ];
  for (const c of customers) {
    try {
      await pool.query(
        `INSERT INTO customers (branch_id, name, type, contact_person, phone, email, city, state, gstin, credit_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c
      );
    } catch (e) { /* skip duplicates */ }
  }
  console.log(`   ✅ ${customers.length} customers seeded`);

  // ── 5. Vendors ───────────────────────────────────────
  console.log('🏭 Inserting vendors...');
  const vendors = [
    ['Havells India Ltd.', 'Sales Dept', '+91-11-41678000', 'sales@havells.com', 'Noida, UP', '09AAACH1234A1Z1', 30],
    ['Siemens India', 'Distribution', '+91-22-39677000', 'dist@siemens.in', 'Mumbai, MH', '27AAACS1234A1Z2', 45],
    ['Legrand India', 'Sales', '+91-22-40586000', 'sales@legrand.in', 'Mumbai, MH', '27AAACL1234A1Z3', 30],
    ['Polycab Wires', 'B2B Sales', '+91-22-66177600', 'b2b@polycab.com', 'Mumbai, MH', '27AAACP1234A1Z4', 30],
    ['Schneider Electric', 'Channel Sales', '+91-124-3941000', 'channel@schneider.in', 'Gurgaon, HR', '06AAACS1234A1Z5', 60],
    ['ABB India', 'Distribution', '+91-80-22949300', 'dist@abb.in', 'Bangalore, KA', '29AAACA1234A1Z6', 45],
  ];
  for (const v of vendors) {
    try {
      await pool.query(
        'INSERT INTO vendors (name, contact_person, phone, email, address, gstin, credit_terms) VALUES (?, ?, ?, ?, ?, ?, ?)',
        v
      );
    } catch (e) { /* skip duplicates */ }
  }
  console.log(`   ✅ ${vendors.length} vendors seeded`);

  console.log('\n✅ Seed complete! You can now login with:');
  console.log('   Email: admin@shivamenterprise.com');
  console.log('   Password: Password@123');
  console.log('');
  console.log('   Other users: bm.pune@, sales.pune@, acc.pune@shivamenterprise.com');
  console.log('   All passwords: Password@123');

  await pool.end();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
