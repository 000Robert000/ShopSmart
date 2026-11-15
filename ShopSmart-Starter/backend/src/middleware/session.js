import { hashToken, parseCookies, SESSION_COOKIE } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

// Attaches request.customer when the request carries a valid, unexpired session cookie.
export async function loadSession(request, _response, next) {
  try {
    request.customer = null;
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) return next();
    const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { customer: true } });
    if (session && session.expiresAt > new Date()) {
      request.customer = session.customer;
      request.sessionId = session.id;
    }
    next();
  } catch (error) { next(error); }
}

export function requireCustomer(request, response, next) {
  if (!request.customer) {
    return response.status(401).json({ error: { code: 'SIGN_IN_REQUIRED', message: 'Please sign in to continue.' } });
  }
  next();
}
