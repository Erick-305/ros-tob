import { Router } from 'express';
import { db } from '../../prisma/db.js';
import { money } from '../lib/helpers.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { DomainError, asyncRoute } from '../middleware/async-route.js';
import { idSchema } from '../schemas/common.schema.js';
import { saleSchema } from '../schemas/sale.schema.js';

export const salesRouter = Router();

salesRouter.post('/', asyncRoute(async (req, res) => {
  const data = saleSchema.parse(req.body);
  const actorUserId = (req as AuthedRequest).user!.id;
  const shippingAmount = data.shippingActive ? data.shippingAmount : 0;
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await db.transaction(async (tx) => {
        const books = await Promise.all(data.items.map((item) => tx.orm.public.Book.first({ id: item.bookId })));
        books.forEach((book, index) => {
          const item = data.items[index]!;
          if (!book || !book.active) throw new DomainError('Uno de los libros no existe.');
          if (book.stock < item.quantity) throw new DomainError(`Stock insuficiente para ${book.title}.`);
        });
        let customer = null;
        if (data.customer?.name) {
          const existingCustomer = data.customer.email
            ? await tx.orm.public.Customer.where({ email: data.customer.email }).first()
            : data.customer.taxId
              ? await tx.orm.public.Customer.where({ taxId: data.customer.taxId }).first()
              : null;
          const customerData = {
            name: data.customer.name,
            ...(data.customer.taxId === undefined ? {} : { taxId: data.customer.taxId }),
            ...(data.customer.phone === undefined ? {} : { phone: data.customer.phone }),
            ...(data.customer.email === undefined ? {} : { email: data.customer.email }),
            ...(data.customer.address === undefined ? {} : { address: data.customer.address }),
            ...(data.customer.city === undefined ? {} : { city: data.customer.city }),
          };
          customer = existingCustomer
            ? await tx.orm.public.Customer.where({ id: existingCustomer.id }).update(customerData)
            : await tx.orm.public.Customer.create(customerData);
        }
        const sales = await tx.orm.public.Sale.all();
        const number = Math.max(0, ...sales.map((sale: any) => sale.number)) + 1;
        const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const sale = await tx.orm.public.Sale.create({
          number, customerId: customer?.id ?? null, userId: actorUserId, subtotal: String(subtotal),
          shippingActive: data.shippingActive, shippingAmount: String(shippingAmount),
          receivedConfirmed: data.receivedConfirmed, status: 'COMPLETED',
          ...(data.sellerName === undefined ? {} : { sellerName: data.sellerName }),
          ...(data.shippingAddress === undefined ? {} : { shippingAddress: data.shippingAddress }),
          ...(data.shippingReference === undefined ? {} : { shippingReference: data.shippingReference }),
          ...(data.shippingNote === undefined ? {} : { shippingNote: data.shippingNote }),
          ...(data.receivedName === undefined ? {} : { receivedName: data.receivedName }),
          ...(data.receivedId === undefined ? {} : { receivedId: data.receivedId }),
        });
        for (let index = 0; index < data.items.length; index += 1) {
          const item = data.items[index]!;
          const book = books[index]!;
          const newStock = book.stock - item.quantity;
          const unitPrice = item.unitPrice;
          await tx.orm.public.SaleItem.create({ saleId: sale.id, bookId: book.id, barcode: book.barcode, description: book.title, quantity: item.quantity, unitPrice: String(unitPrice), total: String(item.quantity * unitPrice) });
          await tx.orm.public.Book.where({ id: book.id }).update({ stock: newStock });
          await tx.orm.public.InventoryMovement.create({ bookId: book.id, userId: actorUserId, type: 'SALE', quantity: item.quantity, previousStock: book.stock, newStock, reason: `Venta #${number}` });
        }
        return { ...sale, subtotal: money(sale.subtotal), shippingAmount, total: subtotal + shippingAmount };
      });
      break;
    } catch (error) {
      const isNumberCollision = error instanceof Error && /unique|duplicate|number/i.test(error.message);
      if (!isNumberCollision || attempt === 2) throw error;
    }
  }
  res.status(201).json(result);
}));

salesRouter.get('/', asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const pageSize = 20;
  const sales = await db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).limit(pageSize).offset((page - 1) * pageSize).all();
  const result = await Promise.all(sales.map(async (sale: any) => {
    const customer = sale.customerId ? await db.orm.public.Customer.first({ id: sale.customerId }) : null;
    return { ...sale, customerName: customer?.name ?? null, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount) };
  }));
  res.json({ items: result, page, pageSize, hasNextPage: result.length === pageSize });
}));

salesRouter.get('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const sale = await db.orm.public.Sale.first({ id });
  if (!sale) { res.status(404).json({ message: 'Venta no encontrada.' }); return; }
  const [items, customer, user] = await Promise.all([
    db.orm.public.SaleItem.where({ saleId: id }).all(),
    sale.customerId ? db.orm.public.Customer.first({ id: sale.customerId }) : Promise.resolve(null),
    db.orm.public.User.first({ id: sale.userId }),
  ]);
  res.json({ ...sale, customer, user, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount), items });
}));

salesRouter.delete('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  await db.transaction(async (tx) => {
    const sale = await tx.orm.public.Sale.first({ id });
    if (!sale) throw new DomainError('Venta no encontrada.');
    const items = await tx.orm.public.SaleItem.where({ saleId: id }).all();
    for (const item of items) {
      const book = await tx.orm.public.Book.first({ id: item.bookId });
      if (!book) continue;
      await tx.orm.public.Book.where({ id: book.id }).update({ stock: book.stock + item.quantity });
      await tx.orm.public.InventoryMovement.create({ bookId: book.id, userId: sale.userId, type: 'SALE_REVERSAL', quantity: item.quantity, previousStock: book.stock, newStock: book.stock + item.quantity, reason: `Eliminación de venta #${sale.number}` });
    }
    for (const item of items) await tx.orm.public.SaleItem.where({ id: item.id }).delete();
    await tx.orm.public.Sale.where({ id }).delete();
  });
  res.json({ message: 'Venta eliminada y stock restaurado.' });
}));
