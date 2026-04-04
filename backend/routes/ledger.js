const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { authenticate, authorize, branchFilter } = require('../middleware/auth');
const { getNextSequence } = require('../utils/sequence');

router.use(authenticate, authorize('admin', 'accountant'), branchFilter);

// GET /api/ledger/accounts
router.get('/accounts', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ledger_accounts WHERE is_active = TRUE ORDER BY code');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/ledger/journal-entries
router.get('/journal-entries', async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;
    let sql = `SELECT je.*, b.name AS branch_name, u.name AS created_by_name
               FROM journal_entries je
               JOIN branches b ON b.id = je.branch_id
               JOIN users u ON u.id = je.created_by
               WHERE 1=1`;
    const params = [];
    if (req.branchId) { sql += ' AND je.branch_id = ?'; params.push(req.branchId); }
    if (from_date)    { sql += ' AND je.entry_date >= ?'; params.push(from_date); }
    if (to_date)      { sql += ' AND je.entry_date <= ?'; params.push(to_date); }
    sql += ' ORDER BY je.entry_date DESC, je.id DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/ledger/journal-entries/:id — with lines
router.get('/journal-entries/:id', async (req, res, next) => {
  try {
    const [entries] = await pool.query(
      `SELECT je.*, b.name AS branch_name FROM journal_entries je
       JOIN branches b ON b.id = je.branch_id WHERE je.id = ?`, [req.params.id]);
    if (entries.length === 0) throw new AppError('Journal entry not found', 404);

    const [lines] = await pool.query(
      `SELECT jel.*, la.code AS account_code, la.name AS account_name, la.type AS account_type
       FROM journal_entry_lines jel JOIN ledger_accounts la ON la.id = jel.account_id
       WHERE jel.journal_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...entries[0], lines } });
  } catch (err) { next(err); }
});

// POST /api/ledger/journal-entries
router.post('/journal-entries', async (req, res, next) => {
  try {
    const { entry_date, narration, reference_type, reference_id, lines } = req.body;
    if (!entry_date || !lines || lines.length < 2) {
      throw new AppError('entry_date and at least 2 lines required', 400);
    }

    // Validate double-entry
    let totalDebit = 0, totalCredit = 0;
    for (const line of lines) {
      totalDebit += line.debit_amount || 0;
      totalCredit += line.credit_amount || 0;
    }
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new AppError('Debits must equal credits', 400);
    }

    const bid = req.user.role === 'admin' ? (req.body.branch_id || req.user.branch_id) : req.user.branch_id;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const journalNo = await getNextSequence('JRN');

      const [result] = await conn.query(
        `INSERT INTO journal_entries (journal_no, branch_id, entry_date, narration,
         reference_type, reference_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [journalNo, bid, entry_date, narration, reference_type, reference_id, req.user.id]
      );
      const journalId = result.insertId;

      for (const line of lines) {
        await conn.query(
          `INSERT INTO journal_entry_lines (journal_id, account_id, debit_amount, credit_amount)
           VALUES (?, ?, ?, ?)`,
          [journalId, line.account_id, line.debit_amount || 0, line.credit_amount || 0]
        );
      }

      await conn.commit();
      res.status(201).json({ success: true, data: { id: journalId, journal_no: journalNo } });
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  } catch (err) { next(err); }
});

// GET /api/ledger/account-balance/:accountId — running balance
router.get('/account-balance/:accountId', async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;
    let sql = `SELECT je.entry_date, je.narration, je.reference_type, je.journal_no,
                      jel.debit_amount, jel.credit_amount
               FROM journal_entry_lines jel
               JOIN journal_entries je ON je.id = jel.journal_id
               WHERE jel.account_id = ?`;
    const params = [req.params.accountId];
    if (req.branchId) { sql += ' AND je.branch_id = ?'; params.push(req.branchId); }
    if (from_date)    { sql += ' AND je.entry_date >= ?'; params.push(from_date); }
    if (to_date)      { sql += ' AND je.entry_date <= ?'; params.push(to_date); }
    sql += ' ORDER BY je.entry_date ASC, je.id ASC';
    const [rows] = await pool.query(sql, params);

    // Compute running balance
    let balance = 0;
    const result = rows.map(row => {
      balance += (row.debit_amount || 0) - (row.credit_amount || 0);
      return { ...row, balance };
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
