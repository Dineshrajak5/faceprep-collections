// Shared server-side Google-Sheet sync. Fetches the published CSV (SHEET_CSV_URL),
// parses it into invoice rows, and caches the result in Supabase (sheet_cache).
// Used by /api/sheet (on-demand) and /api/cron (daily).

const SB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, opts = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

function parseCSV(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') {} else cur += c; }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function colIdx(H, ...keys) {
  const n = H.map(h => (h || '').toLowerCase().replace(/\s+/g, ' ').trim());
  for (const k of keys) { const i = n.findIndex(h => h === k.toLowerCase()); if (i >= 0) return i; }
  for (const k of keys) { const i = n.findIndex(h => h.includes(k.toLowerCase())); if (i >= 0) return i; }
  return -1;
}
function toNum(v) { if (v == null) return 0; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function toDate(v) { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
const STMAP = { TN:'Tamil Nadu', AP:'Andhra Pradesh', KA:'Karnataka', MH:'Maharashtra', TL:'Telangana', KL:'Kerala', RJ:'Rajasthan', GJ:'Gujarat', MP:'Madhya Pradesh', HR:'Haryana', WB:'West Bengal', PY:'Puducherry' };

function buildRows(text) {
  const grid = parseCSV(text).filter(r => r.length > 1);
  if (grid.length < 2) throw new Error('Sheet returned no data rows.');
  const H = grid[0];
  const iC = {
    pi: colIdx(H, 'Proforma Invoice #', 'proforma invoice'), ti: colIdx(H, 'Tax Invoice #'),
    pdate: colIdx(H, 'Proforma Invoice raised date'), tdate: colIdx(H, 'Tax invoice raising date', 'tax invoice raising'),
    client: colIdx(H, 'Client Name'), program: colIdx(H, 'Program name', 'program'), fy: colIdx(H, 'Invoiced on'),
    net: colIdx(H, 'Net amount'), gross: colIdx(H, 'Gross Amount'), out: colIdx(H, 'Collection Outstanding'),
    ostally: colIdx(H, 'Collection OS as per Tally', 'collection os'), status: colIdx(H, 'Payment Status'),
    owner: colIdx(H, 'Owner'), team: colIdx(H, 'Owning Team'), cat: colIdx(H, 'Outstanding Category'),
    state: colIdx(H, 'State', 'gst state'),
  };
  if (iC.client < 0 || iC.out < 0) throw new Error('Could not find Client / Outstanding columns in the sheet.');
  const out = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i]; const g = k => iC[k] >= 0 ? r[iC[k]] : '';
    const client = (g('client') || '').trim(); if (!client) continue;
    const gross = toNum(g('gross')), os = toNum(g('out'));
    const pd = toDate(g('pdate')), td = toDate(g('tdate'));
    let owner = (g('owner') || 'Unassigned').trim(); if (owner.toLowerCase() === 'dinesh raja') owner = 'Dinesh Raja';
    const stRaw = (g('state') || '').trim(); const state = STMAP[stRaw] || stRaw || 'Unknown';
    const pi = (g('pi') || '').trim();
    out.push({
      pi, ti: (g('ti') || '').trim(), pdate: pd, tdate: td, client,
      program: (g('program') || '').replace(/\s+/g, ' ').trim(), fy: (g('fy') || 'NA').trim(),
      net: toNum(g('net')), gross, outstanding: os, os_tally: toNum(g('ostally')) || os,
      collected: Math.round((gross - os) * 100) / 100,
      status: (g('status') || 'Unknown').trim(), owner, team: (g('team') || '—').trim(),
      category: (g('cat') || '—').trim(), state, key: pi || ('GEN-' + i),
    });
  }
  if (!out.length) throw new Error('Parsed 0 valid rows from the sheet.');
  return out;
}

async function syncSheet() {
  const url = process.env.SHEET_CSV_URL;
  if (!url) throw new Error('SHEET_CSV_URL not configured.');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not fetch sheet CSV: HTTP ' + res.status);
  const rows = buildRows(await res.text());
  const synced_at = new Date().toISOString();
  await sb('sheet_cache?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({ id: 1, data: rows, synced_at }),
  });
  return { rows, synced_at };
}

async function getCache() {
  let rowsResp;
  try { rowsResp = await sb('sheet_cache?id=eq.1&select=*'); } catch (e) { rowsResp = null; }
  if (rowsResp && rowsResp.length && rowsResp[0].data) {
    return { rows: rowsResp[0].data, synced_at: rowsResp[0].synced_at };
  }
  return syncSheet(); // cold cache → populate now
}

// ---------- Collections subsheet (standalone transactions) ----------
const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
function parseColDate(s) {
  if (!s) return null;
  const first = String(s).split(/\s+AND\s+|,/)[0].trim();
  const m = first.match(/(\d{1,2})[-\s]*([A-Za-z]{3,9})[-\s]*(\d{4})/);
  if (m) {
    const d = +m[1], mon = MONTHS[m[2].slice(0,3).toLowerCase()], y = +m[3];
    if (mon) { const dt = new Date(Date.UTC(y, mon-1, d)); return isNaN(dt) ? `${y}-${String(mon).padStart(2,'0')}-01` : dt.toISOString().slice(0,10); }
  }
  return null;
}
function buildCollections(text) {
  const grid = parseCSV(text).filter(r => r.length > 1);
  if (grid.length < 2) throw new Error('Collections sheet returned no data rows.');
  const H = grid[0];
  const iC = {
    date: colIdx(H, 'Payment received date'), desc: colIdx(H, 'Description'),
    amt: colIdx(H, 'Payment received'), deal: colIdx(H, 'Deal number'),
    client: colIdx(H, 'Client name'), pi: colIdx(H, 'Proforma Invoice number'),
    ti: colIdx(H, 'Tax Invoice number'), gross: colIdx(H, 'Gross Invoice Value'), tds: colIdx(H, 'TDS'),
  };
  if (iC.amt < 0) throw new Error('Could not find "Payment received" column.');
  const out = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i]; const g = k => iC[k] >= 0 ? r[iC[k]] : '';
    const amt = toNum(g('amt'));
    const client = (g('client') || '').trim();
    if (!amt && !client) continue;
    out.push({
      date: parseColDate(g('date')), client,
      amt, desc: (g('desc') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      deal: (g('deal') || '').trim(), pi: (g('pi') || '').trim(), ti: (g('ti') || '').trim(),
      gross: toNum(g('gross')), tds: toNum(g('tds')),
    });
  }
  return out;
}
async function syncCollections() {
  const url = process.env.SHEET_COLLECTIONS_CSV_URL;
  if (!url) throw new Error('SHEET_COLLECTIONS_CSV_URL not configured.');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not fetch collections CSV: HTTP ' + res.status);
  const rows = buildCollections(await res.text());
  const synced_at = new Date().toISOString();
  await sb('sheet_cache?on_conflict=id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({ id: 2, data: rows, synced_at }),
  });
  return { rows, synced_at };
}
async function getCollections() {
  let resp;
  try { resp = await sb('sheet_cache?id=eq.2&select=*'); } catch (e) { resp = null; }
  if (resp && resp.length && resp[0].data) return { rows: resp[0].data, synced_at: resp[0].synced_at };
  return syncCollections();
}

module.exports = { syncSheet, getCache, syncCollections, getCollections };
