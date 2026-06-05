// Follow-up persistence API (Supabase Postgres via REST).
// GET  /api/updates                  -> { meta:{key:{...}}, activity:{key:[{ts,author,who,note}]} }
// POST /api/updates {action:'meta', key, stage, contact_person, deadline, next_step}
// POST /api/updates {action:'note', key, author, who, note}   (append-only)
//
// Follow-up data lives ENTIRELY in this database, joined to invoices by Proforma Invoice # (`key`).
// Re-scraping the Google Sheet never touches these tables, so notes persist for the same entry.

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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!SB || !KEY) { res.statusCode = 500; return res.end(JSON.stringify({ error: 'DB not configured' })); }

  try {
    if (req.method === 'GET') {
      const [metaRows, actRows] = await Promise.all([
        sb('invoice_updates?select=*'),
        sb('invoice_activity?select=*&order=ts.asc'),
      ]);
      const meta = {};
      for (const m of metaRows) meta[m.key] = {
        stage: m.stage, contact_person: m.contact_person,
        deadline: m.deadline || '', next_followup: m.next_followup || '',
        next_step: m.next_step, updated_at: m.updated_at,
      };
      const activity = {};
      for (const a of actRows) (activity[a.key] = activity[a.key] || [])
        .push({ ts: new Date(a.ts).getTime(), author: a.author, who: a.who || '', note: a.note });
      return res.end(JSON.stringify({ meta, activity }));
    }

    if (req.method === 'POST') {
      let body = ''; await new Promise(r => { req.on('data', c => (body += c)); req.on('end', r); });
      const p = JSON.parse(body || '{}');
      if (!p.key) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'key required' })); }

      if (p.action === 'note') {
        await sb('invoice_activity', {
          method: 'POST',
          body: JSON.stringify({ key: p.key, author: p.author || 'Team', who: p.who || '', note: p.note || '' }),
        });
        return res.end(JSON.stringify({ ok: true }));
      }
      // default: upsert meta (last-write-wins on these fields only)
      await sb('invoice_updates?on_conflict=key', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({
          key: p.key, stage: p.stage || 'New',
          contact_person: p.contact_person || '', deadline: p.deadline || null,
          next_followup: p.next_followup || null,
          next_step: p.next_step || '', updated_at: new Date().toISOString(),
        }),
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
