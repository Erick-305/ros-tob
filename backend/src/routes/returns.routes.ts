import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { money, roundMoney } from '../lib/helpers.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { DomainError, asyncRoute } from '../middleware/async-route.js';
import { idSchema } from '../schemas/common.schema.js';

export const returnsRouter = Router();

const normalizeIdentity = (value: string | null | undefined) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();
const normalizeTaxId = (value: string | null | undefined) => (value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();

const returnSchema = z.object({
  saleId: idSchema,
  reason: z.string().trim().min(1).max(300),
  items: z.array(z.object({
    saleItemId: idSchema,
    quantity: z.coerce.number().int().positive(),
  })).min(1),
}).superRefine((data, context) => {
  if (new Set(data.items.map((item) => item.saleItemId)).size !== data.items.length) {
    context.addIssue({ code: 'custom', message: 'No repitas un libro en la misma devolución.', path: ['items'] });
  }
});

returnsRouter.get('/sales', asyncRoute(async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const sales = search
    ? await db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).all()
    : await db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).limit(100).all();
  const [saleItems, returnItems, customers] = await Promise.all([
    db.orm.public.SaleItem.all(),
    db.orm.public.SalesReturnItem.all(),
    db.orm.public.Customer.all(),
  ]);
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const searchIdentity = normalizeIdentity(search);
  const searchTaxId = normalizeTaxId(search);
  const searchNumber = search.replace(/^(venta|nota)\s*#?\s*/i, '').replace(/^#\s*/, '').trim()
    .replace(/^0+(?=\d)/, '');
  const matchingSales = search ? sales.filter((sale) => {
    const customer = customersById.get(sale.customerId ?? -1);
    return normalizeIdentity(customer?.name ?? sale.customerName).includes(searchIdentity)
      || Boolean(searchTaxId && normalizeTaxId(customer?.taxId ?? sale.customerTaxId).includes(searchTaxId))
      || Boolean(/^\d+$/.test(searchNumber) && String(sale.number).includes(searchNumber));
  }) : sales;
  const returnedQuantities = new Map<number, number>();
  for (const item of returnItems) returnedQuantities.set(item.saleItemId, (returnedQuantities.get(item.saleItemId) ?? 0) + item.quantity);
  const matchingSaleIds = new Set(matchingSales.map((sale) => sale.id));
  const items = saleItems.filter((item) => matchingSaleIds.has(item.saleId)).map((item) => ({
    id: item.id,
    saleId: item.saleId,
    description: item.description,
    barcode: item.barcode,
    quantity: item.quantity,
    returnedQuantity: returnedQuantities.get(item.id) ?? 0,
    unitPrice: money(item.unitPrice),
  }));
  res.json(matchingSales.map((sale) => ({
    id: sale.id,
    number: sale.number,
    createdAt: sale.createdAt,
    customerName: customersById.get(sale.customerId ?? -1)?.name ?? sale.customerName ?? null,
    customerTaxId: customersById.get(sale.customerId ?? -1)?.taxId ?? sale.customerTaxId ?? null,
    items: items.filter((item) => item.saleId === sale.id && item.returnedQuantity < item.quantity),
  })).filter((sale) => sale.items.length > 0).slice(0, 100));
}));

returnsRouter.get('/', asyncRoute(async (_req, res) => {
  const returns = await db.orm.public.SalesReturn.orderBy((entry) => entry.createdAt.desc()).limit(100).all();
  const [sales, returnItems] = await Promise.all([
    db.orm.public.Sale.all(),
    db.orm.public.SalesReturnItem.all(),
  ]);
  const customers = await db.orm.public.Customer.all();
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const result = await Promise.all(returns.map(async (entry) => {
    const items = returnItems.filter((item) => item.returnId === entry.id);
    const sale = salesById.get(entry.saleId);
    const customer = sale?.customerId ? customersById.get(sale.customerId) : null;
    return {
      ...entry,
      refundAmount: money(entry.refundAmount),
      saleNumber: sale?.number ?? null,
      customerName: customer?.name ?? sale?.customerName ?? null,
      customerTaxId: customer?.taxId ?? sale?.customerTaxId ?? null,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      descriptions: [...new Set(items.map((item) => item.bookId))],
    };
  }));
  const books = await db.orm.public.Book.all();
  const titles = new Map(books.map((book) => [book.id, book.title]));
  res.json(result.map((entry) => ({
    ...entry,
    descriptions: entry.descriptions.map((id) => titles.get(id) ?? 'Libro eliminado'),
  })));
}));

returnsRouter.post('/', asyncRoute(async (req, res) => {
  const data = returnSchema.parse(req.body);
  const actorUserId = (req as AuthedRequest).user!.id;
  const result = await db.transaction(async (tx) => {
    const sale = await tx.orm.public.Sale.first({ id: data.saleId });
    if (!sale) throw new DomainError('Venta no encontrada.');
    const returnableItems = await Promise.all(data.items.map(async (item) => {
      const saleItem = await tx.orm.public.SaleItem.first({ id: item.saleItemId });
      if (!saleItem || saleItem.saleId !== sale.id) throw new DomainError('El libro no pertenece a la venta seleccionada.');
      const previousReturns = await tx.orm.public.SalesReturnItem.where({ saleItemId: saleItem.id }).all();
      const returnedQuantity = previousReturns.reduce((sum, previous) => sum + previous.quantity, 0);
      if (returnedQuantity + item.quantity > saleItem.quantity) throw new DomainError(`La cantidad devuelta supera lo vendido de ${saleItem.description}.`);
      const book = await tx.orm.public.Book.first({ id: saleItem.bookId });
      if (!book) throw new DomainError(`No se encontró el libro ${saleItem.description}.`);
      return { saleItem, book, quantity: item.quantity, unitPrice: money(saleItem.unitPrice) };
    }));
    const refundAmount = roundMoney(returnableItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const salesReturn = await tx.orm.public.SalesReturn.create({
      saleId: sale.id,
      userId: actorUserId,
      reason: data.reason,
      refundAmount: String(refundAmount),
    });
    for (const item of returnableItems) {
      const newStock = item.book.stock + item.quantity;
      await tx.orm.public.SalesReturnItem.create({
        returnId: salesReturn.id,
        saleItemId: item.saleItem.id,
        bookId: item.book.id,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
      });
      await tx.orm.public.Book.where({ id: item.book.id }).update({ stock: newStock });
      await tx.orm.public.InventoryMovement.create({
        bookId: item.book.id,
        userId: actorUserId,
        type: 'RETURN',
        quantity: item.quantity,
        previousStock: item.book.stock,
        newStock,
        reason: `Devolución de venta #${sale.number}`,
      });
    }
    return { ...salesReturn, refundAmount, saleNumber: sale.number };
  });
  res.status(201).json(result);
}));
