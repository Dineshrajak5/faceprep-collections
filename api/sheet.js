// GET  /api/sheet  -> cached invoice rows  { rows, synced_at }
// POST /api/sheet  -> force refresh from the live Google Sheet, then return fresh rows
const { getCache, syncSheet } = require('../lib/sheetParse');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const data = req.method === 'POST' ? await syncSheet() : await getCache();
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
