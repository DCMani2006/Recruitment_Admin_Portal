import { Request, Response, NextFunction } from 'express';
import { Admin } from '@prisma/client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export interface CustomRequest extends Request {
  user?: Admin;
}

// The one secret admin login tokens are signed and checked with. There is no built-in fallback:
// a known fallback would let anyone make their own admin token. Use a different value from the
// student backend's JWT_SECRET.
export const getJwtSecret = (): string | undefined => process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET;

// First-time setup code for an admin email. Only someone who was given it can set that admin's
// password, so knowing an assigned email isn't enough. It's derived from the email and the JWT secret,
// so nothing is stored; it stops mattering once the password is set.
export const setupCodeFor = (email: string): string | null => {
  const secret = getJwtSecret();
  if (!secret) return null;
  return crypto
    .createHmac('sha256', secret)
    .update(`admin-setup:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
};

export const setupCodeMatches = (email: string, code: unknown): boolean => {
  const expected = setupCodeFor(email);
  if (!expected || typeof code !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(code.trim().toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// 1. Verify the JWT token sent by the Admin Frontend
export const verifyToken = (
  req: CustomRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access Denied: No token provided',
      });
    }

    const token = authHeader.split(' ')[1];
    const secret = getJwtSecret();

    if (!secret) {
      return res.status(500).json({
        success: false,
        message: 'JWT secret is not configured',
      });
    }

    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.user = decoded as Admin;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

// 2. Check whether the logged-in Admin has the required role
export const authorizeRole = (allowedRoles: string[]) => {
  return (req: CustomRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: Invalid Role',
      });
    }

    next();
  };
};

// 3. Limit login / setup attempts: 10 per email per 15 minutes (kept in memory, resets on restart)
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export const limitLoginAttempts = (req: Request, res: Response, next: NextFunction) => {
  const key = String(req.body?.email ?? '').trim().toLowerCase();
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000);
    return res.status(429).json({ success: false, message: `Too many attempts. Try again in ${minutes} minute(s).` });
  } else {
    entry.count++;
  }

  // drop expired entries now and then so the map doesn't grow forever
  if (loginAttempts.size > 5000) {
    for (const [k, v] of loginAttempts) if (v.resetAt <= now) loginAttempts.delete(k);
  }
  next();
};
