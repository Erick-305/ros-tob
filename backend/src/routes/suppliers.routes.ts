import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { money, roundMoney } from '../lib/helpers.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { DomainError, asyncRoute } from '../middleware/async-route.js';
import { idSchema, moneySchema } from '../schemas/common.schema.js';

export const suppliersRouter = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  address: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(500).optional(),
});

const purchaseSchema = z.object({
  supplierId: idSchema,
  invoiceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    bookId: idSchema,
    quantity: z.coerce.number().int().positive(),
    unitCost: moneySchema,
  })).min(1),
}).superRefine((data, context) => {
  if (new Set(data.items.map((item) => item.bookId)).size !== data.items.length) {
    context.addIssue({ code: 'custom', message: 'Cada libro debe aparecer una sola vez; ajusta su cantidad en la misma línea.', path: ['items'] });
  }
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

suppliersRouter.get('/purchases', asyncRoute(async (_req, res) => {
  const [purchases, suppliers, purchaseItems] = await Promise.all([
    db.orm.public.SupplierPurchase.orderBy((purchase) => purchase.createdAt.desc()).limit(100).all(),
    db.orm.public.Supplier.all(),
    db.orm.public.SupplierPurchaseItem.all(),
  ]);
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  res.json(purchases.map((purchase) => ({
    ...purchase,
    number: purchase.id,
    subtotal: money(purchase.subtotal),
    supplierName: supplierNames.get(purchase.supplierId) ?? 'Proveedor eliminado',
    items: purchaseItems.filter((item) => item.purchaseId === purchase.id).map((item) => ({
      ...item,
      unitCost: money(item.unitCost),
      total: money(item.total),
    })),
  })));
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

suppliersRouter.post('/purchases', asyncRoute(async (req, res) => {
  const data = purchaseSchema.parse(req.body);
  const actorUserId = (req as AuthedRequest).user!.id;
  const purchase = await db.transaction(async (tx) => {
    const supplier = await tx.orm.public.Supplier.first({ id: data.supplierId });
    if (!supplier) throw new DomainError('Proveedor no encontrado.');
    const books = await Promise.all(data.items.map((item) => tx.orm.public.Book.first({ id: item.bookId })));
    books.forEach((book) => {
      if (!book || !book.active) throw new DomainError('Uno de los libros no existe o está inactivo.');
    });
    const subtotal = roundMoney(data.items.reduce((sum, item) => sum + item.quantity * roundMoney(item.unitCost), 0));
    const created = await tx.orm.public.SupplierPurchase.create({
      supplierId: supplier.id,
      userId: actorUserId,
      invoiceNumber: data.invoiceNumber ?? null,
      notes: data.notes ?? null,
      subtotal: String(subtotal),
    });
    const items = [];
    for (let index = 0; index < data.items.length; index += 1) {
      const item = data.items[index]!;
      const book = books[index]!;
      const unitCost = roundMoney(item.unitCost);
      const total = roundMoney(item.quantity * unitCost);
      const newStock = book.stock + item.quantity;
      const purchaseItem = await tx.orm.public.SupplierPurchaseItem.create({
        purchaseId: created.id,
        bookId: book.id,
        description: book.title,
        quantity: item.quantity,
        unitCost: String(unitCost),
        total: String(total),
      });
      await tx.orm.public.Book.where({ id: book.id }).update({ stock: newStock, cost: String(unitCost) });
      await tx.orm.public.InventoryMovement.create({
        bookId: book.id,
        userId: actorUserId,
        supplierId: supplier.id,
        unitCost: String(unitCost),
        type: 'ENTRY',
        quantity: item.quantity,
        previousStock: book.stock,
        newStock,
        reason: `Compra #${created.id}${data.invoiceNumber ? ` · Factura ${data.invoiceNumber}` : ''}`,
      });
      items.push({ ...purchaseItem, unitCost, total });
    }
    return { ...created, number: created.id, subtotal, supplierName: supplier.name, items };
  });
  res.status(201).json(purchase);
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
