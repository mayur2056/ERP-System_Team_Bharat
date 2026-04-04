const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, branchFilter } = require('../middleware/auth');

router.use(authenticate, branchFilter);

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const { is_read, type } = req.query;
    let sql = `SELECT n.*, b.name AS branch_name
               FROM notifications n
               LEFT JOIN branches b ON b.id = n.branch_id
               WHERE n.recipient_id = ?`;
    const params = [req.user.id];
    if (is_read !== undefined) { sql += ' AND n.is_read = ?'; params.push(is_read === 'true' ? 1 : 0); }
    if (type) { sql += ' AND n.type = ?'; params.push(type); }
    sql += ' ORDER BY n.created_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/notifications/count — unread count
router.get('/count', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE recipient_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ success: true, data: { unread: row.count } });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_id = ?',
      [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE recipient_id = ?', [req.user.id]);
    res.json({ success: true, message: 'All marked as read' });
  } catch (err) { next(err); }
});

module.exports = router;
