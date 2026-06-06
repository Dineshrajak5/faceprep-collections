// Triggered by Vercel Cron daily (see vercel.json). Refreshes BOTH sheets.
// Protected by CRON_SECRET: Vercel sends "Authorization: Bearer <CRON_SECRET>".
const { syncSheet, syncCollections } = require('../lib/sheetParse');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized' }));
  }
  const result = {};
  try { const a = await syncSheet(); result.outstanding = a.rows.length; } catch (e) { result.outstanding_error = String(e.message || e); }
  try { const b = await syncCollections(); result.collections = b.rows.length; } catch (e) { result.collections_error = String(e.message || e); }
  res.end(JSON.stringify({ ok: true, synced_at: new Date().toISOString(), ...result }));
};
