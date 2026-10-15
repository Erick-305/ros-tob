import { Router } from 'express';
import { z } from 'zod';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../../prisma/db.js';
import { DomainError, asyncRoute } from '../middleware/async-route.js';
import { idSchema } from '../schemas/common.schema.js';

export const customersRouter = Router();

customersRouter.get('/', asyncRoute(async (req, res) => {
  const search = String(req.query['q'] ?? '').trim();
  const customers = search
    ? await db.orm.public.Customer.where((customer) => or(customer.name.ilike(`%${search}%`), customer.taxId.ilike(`%${search}%`), customer.email.ilike(`%${search}%`), customer.phone.ilike(`%${search}%`), customer.city.ilike(`%${search}%`))).orderBy((customer) => customer.name.asc()).limit(30).all()
    : await db.orm.public.Customer.orderBy((customer) => customer.name.asc()).limit(100).all();
  res.json(customers);
}));

customersRouter.patch('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const data = z.object({
    taxId: z.string().trim().max(40).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    address: z.string().trim().max(250).optional(),
    city: z.string().trim().max(100).optional(),
  }).parse(req.body);
  const update = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  const customer = await db.orm.public.Customer.where({ id }).update(update);
  if (!customer) throw new DomainError('Cliente no encontrado.');
  res.json(customer);
}));

customersRouter.delete('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  await db.transaction(async (tx) => {
    const customer = await tx.orm.public.Customer.first({ id });
    if (!customer) throw new DomainError('Cliente no encontrado.');
    // Conserva el historial de ventas: solo desvincula al cliente antes de borrarlo.
    const sales = await tx.orm.public.Sale.where({ customerId: id }).all();
    for (const sale of sales) await tx.orm.public.Sale.where({ id: sale.id }).update({ customerId: null });
    await tx.orm.public.Customer.where({ id }).delete();
  });
  res.json({ message: 'Cliente eliminado.' });
}));
