import crypto from 'node:crypto';
import { promisify } from 'node:util';

// Passwords are hashed with Node's built-in scrypt, so no extra package is needed.
const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 };

export const SESSION_COOKIE = 'shopsmart_session';
export const SESSION_DAYS = 7;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keyLength, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltText, keyText] = parts;
  const expected = Buffer.from(keyText, 'base64');
  const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Used when the email is unknown, so a failed sign-in takes about as long either way.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try { cookies[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* ignore malformed cookie */ }
  }
  return cookies;
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Only a hash of the token is stored, so a database leak does not expose live sessions.
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function secureCookies() {
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === 'true';
  return process.env.NODE_ENV === 'production';
}

export function sessionCookie(token, maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(secureCookies() ? ['Secure'] : [])
  ].join('; ');
}

export function clearedSessionCookie() {
  return sessionCookie('', 0);
}

export function publicCustomer(customer) {
  return { id: customer.id, name: customer.name, email: customer.email };
}

// Ownership rule for private order records: only the customer who placed the order may read it.
export function canReadOrder(customer, order) {
  return Boolean(customer && order && order.customerId !== null && order.customerId === customer.id);
}
