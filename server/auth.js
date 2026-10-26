// Lightweight auth: scrypt-hashed passwords + an HMAC-signed session cookie.
// Deliberately small — enough to give every request a trustworthy user identity
// so ownership and sharing rules are real, without pulling in an auth provider.
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'ajaia_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

export function createSessionToken(userId, secret) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload, secret);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data.uid : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim().split('=')).filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
}

export function sessionCookieOptions(secure) {
  return { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_TTL_MS, path: '/' };
}

// Attaches req.user (or null) on every request.
export function sessionMiddleware(db, secret) {
  return async (req, _res, next) => {
    const uid = readSessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE], secret);
    req.user = uid ? await db.get('SELECT id, email, name, color FROM users WHERE id = ?', [uid]) : null;
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}
