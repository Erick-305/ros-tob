import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DomainError } from './async-route.js';

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: 'Datos inválidos.', errors: error.flatten() }); return; }
  if (error instanceof DomainError) { res.status(400).json({ message: error.message }); return; }
  console.error('Unhandled API error', error);
  res.status(500).json({ message: 'Error interno del servidor.' });
};
