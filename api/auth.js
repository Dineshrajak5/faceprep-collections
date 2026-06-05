// POST { password }  ->  sets HttpOnly signed session cookie on success.
const crypto = require('crypto');

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sign(payloadB64, secret) {
  return b64url(crypto.createHmac('sha256', secret).update(payloadB64).digest());
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405; return res.end('Method Not Allowed');
  }
  let body = '';
  await new Promise(r => { req.on('data', c => (body += c)); req.on('end', r); });
  let password = '';
  try { password = (JSON.parse(body || '{}').password || ''); } catch {}

  const expected = process.env.DASHBOARD_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || '';

  // constant-time compare
  const ok = expected && secret &&
    password.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));

  if (!ok) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false }));
  }

  const TTL = 12 * 60 * 60 * 1000; // 12h session
  const payloadB64 = b64url(JSON.stringify({ exp: Date.now() + TTL }));
  const token = `${payloadB64}.${sign(payloadB64, secret)}`;

  res.setHeader('Set-Cookie',
    `fp_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}`);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
};
