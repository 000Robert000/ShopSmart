import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReadOrder, clearedSessionCookie, hashPassword, hashToken, newSessionToken,
  parseCookies, publicCustomer, sessionCookie, verifyPassword
} from '../src/lib/auth.js';
import { loginSchema, orderSchema, registerSchema } from '../src/validators/schemas.js';

test('a password verifies against its own hash only', async () => {
  const stored = await hashPassword('Demo-pass-123');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('Demo-pass-123', stored), true);
  assert.equal(await verifyPassword('demo-pass-123', stored), false);
  assert.equal(await verifyPassword('Demo-pass-123', 'not-a-hash'), false);
});

test('the same password hashes differently each time (salted)', async () => {
  assert.notEqual(await hashPassword('Demo-pass-123'), await hashPassword('Demo-pass-123'));
});

test('session tokens are random and only their hash is stored', () => {
  const token = newSessionToken();
  assert.ok(token.length >= 40);
  assert.notEqual(token, newSessionToken());
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(token), hashToken(token));
});

test('cookies are parsed from the header', () => {
  assert.deepEqual(parseCookies('a=1; shopsmart_session=abc%2Fdef; bad'), { a: '1', shopsmart_session: 'abc/def' });
  assert.deepEqual(parseCookies(undefined), {});
});

test('the session cookie is HttpOnly and SameSite=Lax, and Secure in production', () => {
  const before = { NODE_ENV: process.env.NODE_ENV, COOKIE_SECURE: process.env.COOKIE_SECURE };
  delete process.env.COOKIE_SECURE;
  process.env.NODE_ENV = 'development';
  assert.match(sessionCookie('t'), /HttpOnly; SameSite=Lax; Max-Age=604800$/);
  process.env.NODE_ENV = 'production';
  assert.match(sessionCookie('t'), /; Secure$/);
  assert.match(clearedSessionCookie(), /Max-Age=0/);
  Object.assign(process.env, before);
  if (before.NODE_ENV === undefined) delete process.env.NODE_ENV;
  if (before.COOKIE_SECURE === undefined) delete process.env.COOKIE_SECURE;
});

test('only the owner can read an order', () => {
  const ana = { id: 1 }, ben = { id: 2 };
  assert.equal(canReadOrder(ana, { customerId: 1 }), true);
  assert.equal(canReadOrder(ben, { customerId: 1 }), false);
  assert.equal(canReadOrder(null, { customerId: 1 }), false);
  // Orders placed before accounts existed have no owner and stay private.
  assert.equal(canReadOrder(ana, { customerId: null }), false);
});

test('public customer data never includes the password hash', () => {
  assert.deepEqual(publicCustomer({ id: 1, name: 'Ana Reyes', email: 'ana@example.com', passwordHash: 'x' }), { id: 1, name: 'Ana Reyes', email: 'ana@example.com' });
});

test('account input is validated and emails are normalised', () => {
  assert.equal(registerSchema.safeParse({ name: 'Ana Reyes', email: ' Ana@Example.COM ', password: 'Demo-pass-123' }).data.email, 'ana@example.com');
  assert.equal(registerSchema.safeParse({ name: 'Ana Reyes', email: 'ana@example.com', password: 'short' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success, false);
  assert.equal(orderSchema.safeParse({ customerName: 'Ana Reyes', address: 'Angeles City, Pampanga', items: [{ productId: 1, quantity: 1 }] }).success, true);
});
