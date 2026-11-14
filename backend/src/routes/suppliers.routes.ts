import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { money } from '../lib/helpers.js';
import { asyncRoute } from '../middleware/async-route.js';
import { idSchema } from '../schemas/common.schema.js';

export const suppliersRouter = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  address: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(500).optional(),
});

suppliersRouter.get('/', asyncRoute(async (_req, res) => {
  const suppliers = await db.orm.public.Supplier.orderBy((supplier) => supplier.name.asc()).all();
  const movements = await db.orm.public.InventoryMovement.orderBy((movement) => movement.createdAt.desc()).all();
  const books = await db.orm.public.Book.all();
  const bookNames = new Map(books.map((book) => [book.id, book.title]));
  const items = suppliers.map((supplier) => ({
    ...supplier,
    entries: movements.filter((movement) => movement.supplierId === supplier.id && movement.type === 'ENTRY').slice(0, 20).map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt,
      quantity: movement.quantity,
      unitCost: movement.unitCost === null ? null : money(movement.unitCost),
      bookTitle: bookNames.get(movement.bookId) ?? 'Libro eliminado',
    })),
  }));
  res.json(items);
}));

suppliersRouter.post('/', asyncRoute(async (req, res) => {
  const data = supplierSchema.parse(req.body);
  const supplier = await db.orm.public.Supplier.create({
    name: data.name,
    contactName: data.contactName ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    notes: data.notes ?? null,
  });
  res.status(201).json(supplier);
}));

suppliersRouter.delete('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const supplier = await db.orm.public.Supplier.first({ id });
  if (!supplier) { res.status(404).json({ message: 'Proveedor no encontrado.' }); return; }
  const entries = await db.orm.public.InventoryMovement.where({ supplierId: id }).all();
  if (entries.length) { res.status(409).json({ message: 'No se puede eliminar un proveedor con entradas de inventario registradas.' }); return; }
  await db.orm.public.Supplier.where({ id }).delete();
  res.json({ message: 'Proveedor eliminado.' });
}));
