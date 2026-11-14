import { Router } from 'express';
import { db } from '../../prisma/db.js';
import { money, roundMoney } from '../lib/helpers.js';
import { type AuthedRequest } from '../middleware/auth.js';
import { DomainError, asyncRoute } from '../middleware/async-route.js';
import { idSchema } from '../schemas/common.schema.js';
import { saleSchema } from '../schemas/sale.schema.js';

export const salesRouter = Router();

const normalizeIdentity = (value: string | null | undefined) => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const normalizeTaxId = (value: string | null | undefined) => (value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();

salesRouter.post('/', asyncRoute(async (req, res) => {
  const data = saleSchema.parse(req.body);
  const actorUserId = (req as AuthedRequest).user!.id;
  const items = data.items.map((item) => ({ ...item, unitPrice: roundMoney(item.unitPrice) }));
  const shippingAmount = data.shippingActive ? roundMoney(data.shippingAmount) : 0;
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await db.transaction(async (tx) => {
        const books = await Promise.all(items.map((item) => tx.orm.public.Book.first({ id: item.bookId })));
        books.forEach((book, index) => {
          const item = items[index]!;
          if (!book || !book.active) throw new DomainError('Uno de los libros no existe.');
          if (book.stock < item.quantity) throw new DomainError(`Stock insuficiente para ${book.title}.`);
        });
        let customer = null;
        if (data.customerId) {
          customer = await tx.orm.public.Customer.first({ id: data.customerId });
          if (!customer || !customer.active) throw new DomainError('El cliente seleccionado ya no está disponible.');
        }
        const customerInput = data.customer;
        if (customerInput?.name) {
          const customers = customer ? [] : await tx.orm.public.Customer.all();
          let existingCustomer = customer;
          if (!existingCustomer && customerInput.taxId) {
            const taxId = normalizeTaxId(customerInput.taxId);
            existingCustomer = customers.find((candidate) => candidate.active && normalizeTaxId(candidate.taxId) === taxId) ?? null;
          }
          if (!existingCustomer && customerInput.email) {
            const email = normalizeIdentity(customerInput.email);
            existingCustomer = customers.find((candidate) => candidate.active && normalizeIdentity(candidate.email) === email) ?? null;
          }
          if (!existingCustomer) {
            const name = normalizeIdentity(customerInput.name);
            const sameName = customers.filter((candidate) => candidate.active && normalizeIdentity(candidate.name) === name);
            const phone = customerInput.phone?.replace(/\D/g, '');
            const compatible = sameName.filter((candidate) =>
              (!customerInput.taxId || !candidate.taxId || normalizeTaxId(candidate.taxId) === normalizeTaxId(customerInput.taxId))
              && (!customerInput.email || !candidate.email || normalizeIdentity(candidate.email) === normalizeIdentity(customerInput.email)));
            const samePhone = phone
              ? compatible.filter((candidate) => candidate.phone?.replace(/\D/g, '') === phone)
              : customerInput.taxId || customerInput.email ? [] : compatible;
            if (samePhone.length > 1) throw new DomainError('Hay varios clientes con ese nombre. Selecciona uno del listado o completa la cédula.');
            existingCustomer = samePhone[0] ?? null;
          }
          const customerData = {
            name: customerInput.name,
            ...(customerInput.taxId === undefined ? {} : { taxId: customerInput.taxId }),
            ...(customerInput.phone === undefined ? {} : { phone: customerInput.phone }),
            ...(customerInput.email === undefined ? {} : { email: customerInput.email }),
            ...(customerInput.address === undefined ? {} : { address: customerInput.address }),
            ...(customerInput.city === undefined ? {} : { city: customerInput.city }),
            active: true,
          };
          customer = existingCustomer
            ? await tx.orm.public.Customer.where({ id: existingCustomer.id }).update(customerData)
            : await tx.orm.public.Customer.create(customerData);
        }
        const sales = await tx.orm.public.Sale.all();
        const number = Math.max(0, ...sales.map((sale: any) => sale.number)) + 1;
        const subtotal = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
        const sale = await tx.orm.public.Sale.create({
          number, customerId: customer?.id ?? null, customerName: customer?.name ?? null, customerTaxId: customer?.taxId ?? null, userId: actorUserId, subtotal: String(subtotal),
          shippingActive: data.shippingActive, shippingAmount: String(shippingAmount),
          receivedConfirmed: data.receivedConfirmed, status: 'COMPLETED',
          ...(data.sellerName === undefined ? {} : { sellerName: data.sellerName }),
          ...(data.shippingAddress === undefined ? {} : { shippingAddress: data.shippingAddress }),
          ...(data.shippingReference === undefined ? {} : { shippingReference: data.shippingReference }),
          ...(data.shippingNote === undefined ? {} : { shippingNote: data.shippingNote }),
          ...(data.receivedName === undefined ? {} : { receivedName: data.receivedName }),
          ...(data.receivedId === undefined ? {} : { receivedId: data.receivedId }),
        });
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index]!;
          const book = books[index]!;
          const newStock = book.stock - item.quantity;
          const unitPrice = item.unitPrice;
          await tx.orm.public.SaleItem.create({ saleId: sale.id, bookId: book.id, barcode: book.barcode, description: book.title, quantity: item.quantity, unitPrice: String(unitPrice), total: String(roundMoney(item.quantity * unitPrice)) });
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
  const search = String(req.query['q'] ?? '').trim();
  const pageSize = 20;
  let hasNextPage: boolean;
  let sales = search
    ? await db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).all()
    : await db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).limit(pageSize).offset((page - 1) * pageSize).all();
  if (search) {
    const customers = await db.orm.public.Customer.all();
    const normalizedSearch = normalizeIdentity(search);
    const normalizedTaxSearch = normalizeTaxId(search);
    const customerIds = new Set(customers.filter((customer) => normalizeIdentity(customer.name).includes(normalizedSearch)
      || Boolean(normalizedTaxSearch && normalizeTaxId(customer.taxId).includes(normalizedTaxSearch))).map((customer) => customer.id));
    sales = sales.filter((sale) => customerIds.has(sale.customerId ?? -1)
      || String(sale.number).includes(search)
      || normalizeIdentity(sale.customerName).includes(normalizedSearch)
      || normalizeTaxId(sale.customerTaxId).includes(normalizeTaxId(search)));
    hasNextPage = sales.length > page * pageSize;
    sales = sales.slice((page - 1) * pageSize, page * pageSize);
  } else {
    hasNextPage = sales.length === pageSize;
  }
  const result = await Promise.all(sales.map(async (sale: any) => {
    const customer = sale.customerId ? await db.orm.public.Customer.first({ id: sale.customerId }) : null;
    return { ...sale, customerName: customer?.name ?? sale.customerName ?? null, customerTaxId: customer?.taxId ?? sale.customerTaxId ?? null, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount) };
  }));
  res.json({ items: result, page, pageSize, hasNextPage });
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
  const customerDetails = customer ?? (sale.customerName || sale.customerTaxId ? { name: sale.customerName, taxId: sale.customerTaxId } : null);
  res.json({ ...sale, customer: customerDetails, user, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount), items });
}));

salesRouter.delete('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  await db.transaction(async (tx) => {
    const sale = await tx.orm.public.Sale.first({ id });
    if (!sale) throw new DomainError('Venta no encontrada.');
    const returns = await tx.orm.public.SalesReturn.where({ saleId: id }).all();
    if (returns.length) throw new DomainError('No se puede eliminar una venta con devoluciones registradas.');
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
