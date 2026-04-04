const mysql = require('mysql2/promise');

async function run() {
  try {
    const pool = mysql.createPool({host:'localhost',user:'root',password:'super',database:'shivam_erp'});
    await pool.query("ALTER TABLE transfers MODIFY COLUMN status ENUM('pending_local','pending_remote','approved','in_transit','received','rejected') DEFAULT 'pending_local'");
    console.log('ALTERED transfers ENUM successfully.');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
