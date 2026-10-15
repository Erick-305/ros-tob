import type { NextFunction, Request, Response } from 'express';

export class DomainError extends Error {}

export const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(next);
