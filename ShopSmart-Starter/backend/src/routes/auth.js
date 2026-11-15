import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import {
  burnPasswordCheck, clearedSessionCookie, hashPassword, hashToken, newSessionToken,
  publicCustomer, SESSION_DAYS, sessionCookie, verifyPassword
} from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { requireCustomer } from '../middleware/session.js';
import { loginSchema, registerSchema } from '../validators/schemas.js';

const router = Router();

// Slows down password guessing: 20 attempts per 15 minutes per IP address.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Please wait a few minutes and try again.' } }
});

async function startSession(response, customerId) {
  const token = newSessionToken();
  await prisma.session.create({
    data: { id: hashToken(token), customerId, expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000) }
  });
  response.setHeader('Set-Cookie', sessionCookie(token));
}

router.post('/register', authLimiter, async (request, response, next) => {
  try {
    const parsed = registerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(422).json({ error: { code: 'INVALID_ACCOUNT', message: 'Enter your name, a valid email and a password of at least 8 characters.' } });
    }
    const { name, email, password } = parsed.data;
    let customer;
    try {
      customer = await prisma.customer.create({ data: { name, email, passwordHash: await hashPassword(password) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return response.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with that email already exists. Please sign in.' } });
      }
      throw error;
    }
    await startSession(response, customer.id);
    response.status(201).json({ customer: publicCustomer(customer) });
  } catch (error) { next(error); }
});

router.post('/login', authLimiter, async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(422).json({ error: { code: 'INVALID_LOGIN', message: 'Enter your email and password.' } });
    }
    const customer = await prisma.customer.findUnique({ where: { email: parsed.data.email } });
    const valid = customer ? await verifyPassword(parsed.data.password, customer.passwordHash) : (await burnPasswordCheck(parsed.data.password), false);
    if (!valid) {
      return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    }
    await startSession(response, customer.id);
    response.json({ customer: publicCustomer(customer) });
  } catch (error) { next(error); }
});

router.post('/logout', async (request, response, next) => {
  try {
    if (request.sessionId) await prisma.session.deleteMany({ where: { id: request.sessionId } });
    response.setHeader('Set-Cookie', clearedSessionCookie());
    response.status(204).end();
  } catch (error) { next(error); }
});

router.get('/me', requireCustomer, (request, response) => {
  response.json({ customer: publicCustomer(request.customer) });
});

export default router;
