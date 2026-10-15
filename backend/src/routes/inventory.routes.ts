import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { publicBook } from '../lib/helpers.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { DomainError, asyncRoute } from '../middleware/async-route.js';
import { idSchema, moneySchema } from '../schemas/common.schema.js';

export const inventoryRouter = Router();

inventoryRouter.post('/inventory/entries', asyncRoute(async (req, res) => {
  const data = z.object({ bookId: idSchema, quantity: z.coerce.number().int().positive(), cost: moneySchema.optional(), userId: idSchema.default(1), reason: z.string().trim().max(200).default('Entrada de inventario') }).parse(req.body);
  const actorUserId = (req as AuthedRequest).user!.id;
  const result = await db.transaction(async (tx) => {
    const book = await tx.orm.public.Book.first({ id: data.bookId });
    if (!book || !book.active) throw new DomainError('Libro no encontrado.');
    const newStock = book.stock + data.quantity;
    const updated = await tx.orm.public.Book.where({ id: book.id }).update({ stock: newStock, ...(data.cost === undefined ? {} : { cost: String(data.cost) }) });
    await tx.orm.public.InventoryMovement.create({ bookId: book.id, userId: actorUserId, type: 'ENTRY', quantity: data.quantity, previousStock: book.stock, newStock, reason: data.reason });
    return updated;
  });
  res.status(201).json(publicBook(result));
}));

inventoryRouter.get('/movements', asyncRoute(async (_req, res) => {
  const movements = await db.orm.public.InventoryMovement.orderBy((movement) => movement.createdAt.desc()).limit(100).all();
  res.json(movements);
}));
