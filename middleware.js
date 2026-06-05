// Vercel Edge Middleware — protects the dashboard.
// Unauthenticated requests are redirected to the login page.
// The session cookie is HMAC-signed with SESSION_SECRET (server-only env var),
// so it cannot be forged from the browser.

export const config = {
  // Allow the login page (clean URL `/login` AND `/login.html`), the auth API,
  // and Vercel internals through without a session. Gate everything else.
  matcher: ['/((?!login|api/auth|favicon.ico|robots.txt|_vercel).*)'],
};

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verify(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [payloadB64, sigB64] = token.split('.');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  if (bytesToB64url(expected) !== sigB64) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    return typeof exp === 'number' && Date.now() < exp;
  } catch { return false; }
}

export default async function middleware(req) {
  const secret = process.env.SESSION_SECRET || '';
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)fp_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : '';

  if (secret && (await verify(token, secret))) {
    return; // authenticated — let the request through
  }
  const url = new URL(req.url);
  url.pathname = '/login';   // clean URL; Vercel serves login.html here
  url.search = '';
  return Response.redirect(url, 302);
}
