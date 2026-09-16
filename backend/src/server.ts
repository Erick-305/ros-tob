import 'dotenv/config';
import bcrypt from 'bcrypt';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../prisma/db.js';

const app = express();
const port = Number(process.env['PORT'] ?? 3000);

app.use(helmet());
app.use(cors({ origin: process.env['FRONTEND_URL'] ?? 'http://localhost:4200' }));
app.use(express.json({ limit: '1mb' }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, message: { message: 'Demasiados intentos. Espera unos minutos.' } });
app.use('/api/auth', authLimiter);

const idSchema = z.coerce.number().int().positive();
const moneySchema = z.coerce.number().finite().nonnegative();

const bookSchema = z.object({
  barcode: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(100),
  cost: moneySchema,
  salePrice: moneySchema,
  stock: z.coerce.number().int().nonnegative(),
  minStock: z.coerce.number().int().nonnegative(),
});

const saleSchema = z.object({
  customer: z.object({
    taxId: z.string().trim().max(40).optional(),
    name: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    address: z.string().trim().max(250).optional(),
  }).optional(),
  userId: idSchema.default(1),
  items: z.array(z.object({
    bookId: idSchema,
    quantity: z.coerce.number().int().positive(),
    unitPrice: moneySchema,
  })).min(1),
  shippingActive: z.boolean().default(false),
  shippingAmount: moneySchema.default(0),
  shippingAddress: z.string().trim().max(250).optional(),
  shippingReference: z.string().trim().max(250).optional(),
  shippingNote: z.string().trim().max(500).optional(),
  receivedConfirmed: z.boolean().default(false),
  receivedName: z.string().trim().max(160).optional(),
  receivedId: z.string().trim().max(40).optional(),
});

const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(next);

const money = (value: unknown) => Number(value ?? 0);
const publicBook = (book: any) => ({ ...book, cost: money(book.cost), salePrice: money(book.salePrice) });

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ros-tob-api' }));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const data = z.object({ username: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  const user = await db.orm.public.User.where({ username: data.username, active: true }).first();
  const valid = user ? await bcrypt.compare(data.password, user.passwordHash) : false;
  if (!user || !valid) { res.status(401).json({ message: 'Usuario o contraseña incorrectos.' }); return; }
  const secret = process.env['JWT_SECRET'] ?? 'ros-tob-development-secret-change-me';
  const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, secret, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
}));

const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) { res.status(401).json({ message: 'Sesión requerida.' }); return; }
  try {
    jwt.verify(token, process.env['JWT_SECRET'] ?? 'ros-tob-development-secret-change-me');
    next();
  } catch { res.status(401).json({ message: 'Sesión expirada. Inicia sesión nuevamente.' }); }
};

app.use('/api', authenticate);

app.get('/api/books', asyncRoute(async (req, res) => {
  const search = String(req.query['q'] ?? '').trim();
  const books = search
    ? await db.orm.public.Book.where((book) => or(book.barcode.ilike(`%${search}%`), book.title.ilike(`%${search}%`), book.author.ilike(`%${search}%`), book.category.ilike(`%${search}%`))).orderBy((book) => book.title.asc()).all()
    : await db.orm.public.Book.orderBy((book) => book.title.asc()).all();
  res.json(books.map(publicBook));
}));

app.get('/api/books/barcode/:barcode', asyncRoute(async (req, res) => {
  const book = await db.orm.public.Book.where({ barcode: String(req.params['barcode']) }).first();
  if (!book) {
    res.status(404).json({ message: 'Código de barras no registrado.' });
    return;
  }
  res.json(publicBook(book));
}));

app.post('/api/books', asyncRoute(async (req, res) => {
  const data = bookSchema.parse(req.body);
  const book = await db.orm.public.Book.create({ ...data, cost: String(data.cost), salePrice: String(data.salePrice) });
  res.status(201).json(publicBook(book));
}));

app.patch('/api/books/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const data = bookSchema.partial().parse(req.body);
  const update = Object.fromEntries(Object.entries({ ...data, ...(data.cost === undefined ? {} : { cost: String(data.cost) }), ...(data.salePrice === undefined ? {} : { salePrice: String(data.salePrice) }) }).filter(([, value]) => value !== undefined));
  const book = await db.orm.public.Book.where({ id }).update(update);
  res.json(publicBook(book));
}));

app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const [books, sales, recentSales] = await Promise.all([
    db.orm.public.Book.where({ active: true }).all(),
    db.orm.public.Sale.where({ status: 'COMPLETED' }).all(),
    db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).limit(5).all(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((sale: any) => String(sale.createdAt).slice(0, 10) === today);
  res.json({
    bookCount: books.length,
    unitsAvailable: books.reduce((sum: number, book: any) => sum + book.stock, 0),
    lowStock: books.filter((book: any) => book.stock > 0 && book.stock <= book.minStock).map(publicBook),
    outOfStock: books.filter((book: any) => book.stock === 0).map(publicBook),
    todaySales: todaySales.length,
    todayTotal: todaySales.reduce((sum: number, sale: any) => sum + money(sale.total), 0),
    recentSales: recentSales.map((sale: any) => ({ ...sale, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount) })),
  });
}));

app.post('/api/inventory/entries', asyncRoute(async (req, res) => {
  const data = z.object({ bookId: idSchema, quantity: z.coerce.number().int().positive(), cost: moneySchema.optional(), userId: idSchema.default(1), reason: z.string().trim().max(200).default('Entrada de inventario') }).parse(req.body);
  const result = await db.transaction(async (tx) => {
    const book = await tx.orm.public.Book.first({ id: data.bookId });
    if (!book) throw new Error('Libro no encontrado.');
    const newStock = book.stock + data.quantity;
    const updated = await tx.orm.public.Book.where({ id: book.id }).update({ stock: newStock, ...(data.cost === undefined ? {} : { cost: String(data.cost) }) });
    await tx.orm.public.InventoryMovement.create({ bookId: book.id, userId: data.userId, type: 'ENTRY', quantity: data.quantity, previousStock: book.stock, newStock, reason: data.reason });
    return updated;
  });
  res.status(201).json(publicBook(result));
}));

app.get('/api/movements', asyncRoute(async (_req, res) => {
  const movements = await db.orm.public.InventoryMovement.orderBy((movement) => movement.createdAt.desc()).limit(100).all();
  res.json(movements);
}));

app.post('/api/sales', asyncRoute(async (req, res) => {
  const data = saleSchema.parse(req.body);
  const shippingAmount = data.shippingActive ? data.shippingAmount : 0;
  const result = await db.transaction(async (tx) => {
    const books = await Promise.all(data.items.map((item) => tx.orm.public.Book.first({ id: item.bookId })));
    books.forEach((book, index) => {
      const item = data.items[index]!;
      if (!book) throw new Error('Uno de los libros no existe.');
      if (book.stock < item.quantity) throw new Error(`Stock insuficiente para ${book.title}.`);
    });
    const customer = data.customer?.name ? await tx.orm.public.Customer.create({
      name: data.customer.name,
      ...(data.customer.taxId === undefined ? {} : { taxId: data.customer.taxId }),
      ...(data.customer.phone === undefined ? {} : { phone: data.customer.phone }),
      ...(data.customer.email === undefined ? {} : { email: data.customer.email }),
      ...(data.customer.address === undefined ? {} : { address: data.customer.address }),
    }) : null;
    const sales = await tx.orm.public.Sale.all();
    const number = Math.max(0, ...sales.map((sale: any) => sale.number)) + 1;
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const sale = await tx.orm.public.Sale.create({
      number, customerId: customer?.id ?? null, userId: data.userId, subtotal: String(subtotal),
      shippingActive: data.shippingActive, shippingAmount: String(shippingAmount),
      receivedConfirmed: data.receivedConfirmed, status: 'COMPLETED',
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
      await tx.orm.public.SaleItem.create({ saleId: sale.id, bookId: book.id, barcode: book.barcode, description: book.title, quantity: item.quantity, unitPrice: String(item.unitPrice), total: String(item.quantity * item.unitPrice) });
      await tx.orm.public.Book.where({ id: book.id }).update({ stock: newStock });
      await tx.orm.public.InventoryMovement.create({ bookId: book.id, userId: data.userId, type: 'SALE', quantity: item.quantity, previousStock: book.stock, newStock, reason: `Venta #${number}` });
    }
    return { ...sale, subtotal: money(sale.subtotal), shippingAmount, total: subtotal + shippingAmount };
  });
  res.status(201).json(result);
}));

app.get('/api/sales', asyncRoute(async (_req, res) => {
  const sales = await db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).limit(100).all();
  res.json(sales.map((sale: any) => ({ ...sale, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount) })));
}));

app.get('/api/sales/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const sale = await db.orm.public.Sale.first({ id });
  if (!sale) { res.status(404).json({ message: 'Venta no encontrada.' }); return; }
  const [items, customer] = await Promise.all([
    db.orm.public.SaleItem.where({ saleId: id }).all(),
    sale.customerId ? db.orm.public.Customer.first({ id: sale.customerId }) : Promise.resolve(null),
  ]);
  res.json({ ...sale, customer, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount), items });
}));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: 'Datos inválidos.', errors: error.flatten() }); return; }
  const message = error instanceof Error ? error.message : 'Error interno del servidor.';
  res.status(400).json({ message });
});

const ensureDefaultUser = async () => {
  const user = await db.orm.public.User.first({ id: 1 });
  if (!user) {
    await db.orm.public.User.create({ id: 1, name: 'Administrador', username: 'admin', passwordHash: await bcrypt.hash('admin123', 12), role: 'ADMIN', active: true });
  } else if (user.passwordHash === 'local-admin') {
    await db.orm.public.User.where({ id: 1 }).update({ passwordHash: await bcrypt.hash('admin123', 12), active: true });
  }
};

ensureDefaultUser()
  .then(() => app.listen(port, () => console.log(`ROS-TOB API listening on http://localhost:${port}`)))
  .catch((error) => { console.error('Unable to initialize ROS-TOB API', error); process.exitCode = 1; });