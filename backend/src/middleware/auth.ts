import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../prisma/db.js';
import { jwtSecret } from '../config/env.js';

export type AuthedRequest = Request & { user?: { id: number; role: string } };

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) { res.status(401).json({ message: 'Sesión requerida.' }); return; }
  try {
    const payload = jwt.verify(token, jwtSecret);
    const userId = Number((payload as jwt.JwtPayload).sub);
    const user = Number.isInteger(userId) ? await db.orm.public.User.first({ id: userId }) : null;
    if (!user || !user.active) { res.status(401).json({ message: 'La cuenta está inactiva o la sesión ya no es válida.' }); return; }
    (req as AuthedRequest).user = { id: user.id, role: user.role };
    next();
  } catch { res.status(401).json({ message: 'Sesión expirada. Inicia sesión nuevamente.' }); }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthedRequest).user;
  if (user?.role !== 'ADMIN') { res.status(403).json({ message: 'Solo un administrador puede realizar esta acción.' }); return; }
  next();
};
