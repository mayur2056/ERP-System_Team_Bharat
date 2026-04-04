const pool = require('../config/db');

/**
 * Get next sequence number using the stored procedure.
 * Returns format like: ORD-2026-1001, TRF-2026-0101, etc.
 */
async function getNextSequence(prefix) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL get_next_seq(?, @seq_num)', [prefix]);
    const [[row]] = await conn.query('SELECT @seq_num AS seq');
    return row.seq;
  } finally {
    conn.release();
  }
}

module.exports = { getNextSequence };
