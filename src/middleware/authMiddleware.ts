import { Request, Response, NextFunction } from 'express';
import { Admin } from '@prisma/client';
import jwt from 'jsonwebtoken';

export interface CustomRequest extends Request {
  user?: Admin;
}

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

    // Use the same secret as adminController.ts
    const secret =
      process.env.JWT_SECRET ||
      process.env.ADMIN_JWT_SECRET;

    if (!secret) {
      return res.status(500).json({
        success: false,
        message: 'JWT secret is not configured',
      });
    }

    const decoded = jwt.verify(token, secret);
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