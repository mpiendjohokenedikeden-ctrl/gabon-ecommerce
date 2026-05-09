import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role:   string;
    shopId?: string;
  };
}

export function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Token manquant', 401));
  }
  const token   = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) return next(new AppError('Token invalide ou expiré', 401));
  req.user = payload;
  next();
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Non authentifié', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Accès non autorisé', 403));
    }
    next();
  };
}

export const isAdmin  = authorize('admin');
export const isSeller = authorize('seller', 'admin');
export const isDriver = authorize('driver', 'admin');
export const isBuyer  = authorize('buyer', 'seller', 'admin');