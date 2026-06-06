// GET  /api/collections  -> cached transactions  { rows, synced_at }
// POST /api/collections  -> force refresh from the live Collections subsheet
const { getCollections, syncCollections } = require('../lib/sheetParse');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const data = req.method === 'POST' ? await syncCollections() : await getCollections();
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
