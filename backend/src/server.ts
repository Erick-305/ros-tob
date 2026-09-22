import 'dotenv/config';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import dns from 'node:dns';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../prisma/db.js';

const app = express();
const port = Number(process.env['PORT'] ?? 3000);
app.set('trust proxy', 1);
const jwtSecret = process.env['JWT_SECRET'];
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres.');
}

app.use(helmet());
const allowedOrigins = (process.env['FRONTEND_URL'] ?? 'https://ros-tob.web.app,http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, message: { message: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.' } });
const authLimiter = rateLimit({ windowMs: 60 * 1000, limit: 5, message: { message: 'Has alcanzado el máximo de 5 intentos. Espera 1 minuto antes de volver a intentar.' } });
const recoveryLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 3, keyGenerator: (req) => String(req.body?.identifier ?? '').trim().toLowerCase() || ipKeyGenerator(req.ip ?? 'unknown'), message: { message: 'Demasiadas solicitudes de recuperación. Espera 5 minutos antes de volver a intentarlo.' } });
app.use('/api', apiLimiter);
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
    city: z.string().trim().max(100).optional(),
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
const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
const publicBook = (book: any) => ({ ...book, cost: money(book.cost), salePrice: money(book.salePrice) });
const smtpHost = process.env['SMTP_HOST'];
let cachedMailer: ReturnType<typeof nodemailer.createTransport> | null = null;
const getMailer = async () => {
  if (!smtpHost) return null;
  if (cachedMailer) return cachedMailer;
  // Resuelve por IPv4 a mano: Nodemailer elige al azar entre A/AAAA y Railway no tiene salida IPv6.
  const { address } = await dns.promises.lookup(smtpHost, { family: 4 });
  const smtpPort = Number(process.env['SMTP_PORT'] ?? 587);
  // El puerto 465 exige TLS implícito desde el saludo inicial; si no coincide con "secure" el handshake se cuelga.
  const secure = smtpPort === 465 ? true : process.env['SMTP_SECURE'] === 'true';
  cachedMailer = nodemailer.createTransport({
    host: address,
    port: smtpPort,
    secure,
    auth: { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] },
    tls: { servername: smtpHost },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  return cachedMailer;
};
const mailFrom = process.env['MAIL_FROM'] ?? process.env['SMTP_USER'];
const parseFromHeader = (from: string) => {
  const match = from.match(/^(.*)<(.+)>$/);
  return match ? { name: match[1]!.trim().replace(/^"|"$/g, ''), email: match[2]!.trim() } : { email: from.trim() };
};
const sendViaBrevo = async (apiKey: string, email: string, subject: string, text: string) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseFromHeader(mailFrom ?? ''), to: [{ email }], subject, textContent: text }),
  });
  if (!response.ok) throw new Error(`Brevo respondió ${response.status}: ${await response.text()}`);
};
const sendCode = async (email: string, subject: string, code: string, action: string) => {
  const text = `ROS-TOB\n\nTu código para ${action} es: ${code}\n\nVence en 10 minutos.`;
  const brevoKey = process.env['BREVO_API_KEY'];
  // Railway bloquea las conexiones SMTP salientes; Brevo entrega por HTTPS, que sí funciona ahí.
  if (brevoKey) { await sendViaBrevo(brevoKey, email, subject, text); return; }
  const mailer = await getMailer();
  if (!mailer || !mailFrom) throw new Error('El servicio de correo no está configurado.');
  await mailer.sendMail({ from: mailFrom, to: email, subject, text });
};

app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true, service: 'ros-tob-api' }));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (user && !user.active) { res.status(403).json({ message: 'Esta cuenta está inactiva. Solicita al administrador que la active.' }); return; }
  if (user && user.email && !user.emailVerified) { res.status(403).json({ message: 'Debes verificar tu correo antes de iniciar sesión.' }); return; }
  const valid = user ? await bcrypt.compare(data.password, user.passwordHash) : false;
  if (!user || !valid) { res.status(401).json({ message: 'Usuario o contraseña incorrectos.' }); return; }
  const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, jwtSecret, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role } });
}));

app.post('/api/auth/forgot-password', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user?.email) { res.status(200).json({ message: 'Si la cuenta existe, recibirás instrucciones en su correo.' }); return; }
  const code = crypto.randomInt(100000, 1000000).toString();
  await db.orm.public.User.where({ id: user.id }).update({ resetCode: hashCode(code), resetExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  res.json({ message: 'Te enviamos un código de recuperación al correo registrado.' });
  sendCode(user.email, 'Recuperación de contraseña ROS-TOB', code, 'recuperar tu contraseña').catch((error) => console.error('No se pudo enviar el correo de recuperación', error));
}));

app.post('/api/auth/send-verification', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user?.email || user.emailVerified) { res.status(200).json({ message: 'Si la cuenta necesita verificación, recibirás un código en su correo.' }); return; }
  const code = crypto.randomInt(100000, 1000000).toString();
  await db.orm.public.User.where({ id: user.id }).update({ verificationCode: hashCode(code), verificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  res.json({ message: 'Te enviamos un código de verificación al correo registrado.' });
  sendCode(user.email, 'Verificación de correo ROS-TOB', code, 'verificar tu correo').catch((error) => console.error('No se pudo enviar el correo de verificación', error));
}));

app.post('/api/auth/verify-email', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1), code: z.string().trim().length(6) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user || user.emailVerified || user.verificationCode !== hashCode(data.code) || !user.verificationExpiresAt || new Date(user.verificationExpiresAt) < new Date()) { res.status(400).json({ message: 'El código de verificación no es válido o expiró.' }); return; }
  await db.orm.public.User.where({ id: user.id }).update({ emailVerified: true, verificationCode: null, verificationExpiresAt: null });
  res.json({ message: 'Correo verificado. Ya puedes iniciar sesión.' });
}));

app.post('/api/auth/reset-password', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1), code: z.string().trim().length(6), password: z.string().min(12).max(100) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user || user.resetCode !== hashCode(data.code) || !user.resetExpiresAt || new Date(user.resetExpiresAt) < new Date()) { res.status(400).json({ message: 'El código de recuperación no es válido o expiró.' }); return; }
  await db.orm.public.User.where({ id: user.id }).update({ passwordHash: await bcrypt.hash(data.password, 12), resetCode: null, resetExpiresAt: null, emailVerified: true });
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
}));

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) { res.status(401).json({ message: 'Sesión requerida.' }); return; }
  try {
    const payload = jwt.verify(token, jwtSecret);
    const userId = Number((payload as jwt.JwtPayload).sub);
    const user = Number.isInteger(userId) ? await db.orm.public.User.first({ id: userId }) : null;
    if (!user || !user.active) { res.status(401).json({ message: 'La cuenta está inactiva o la sesión ya no es válida.' }); return; }
    (req as Request & { user?: { id: number; role: string } }).user = { id: user.id, role: user.role };
    next();
  } catch { res.status(401).json({ message: 'Sesión expirada. Inicia sesión nuevamente.' }); }
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as Request & { user?: { role?: string } }).user;
  if (user?.role !== 'ADMIN') { res.status(403).json({ message: 'Solo un administrador puede realizar esta acción.' }); return; }
  next();
};

app.use('/api', authenticate);

app.get('/api/users', requireAdmin, asyncRoute(async (_req, res) => {
  const users = await db.orm.public.User.orderBy((user) => user.id.asc()).all();
  res.json(users.map((user: any) => ({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, active: user.active })));
}));

app.patch('/api/users/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const data = z.object({ active: z.boolean() }).parse(req.body);
  if (id === 1) { res.status(400).json({ message: 'La cuenta de Erick no se puede desactivar.' }); return; }
  const user = await db.orm.public.User.where({ id }).update({ active: data.active });
  if (!user) { res.status(404).json({ message: 'Usuario no encontrado.' }); return; }
  res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, active: user.active });
}));

app.get('/api/customers', asyncRoute(async (req, res) => {
  const search = String(req.query['q'] ?? '').trim();
  const customers = search
    ? await db.orm.public.Customer.where((customer) => or(customer.name.ilike(`%${search}%`), customer.taxId.ilike(`%${search}%`), customer.email.ilike(`%${search}%`), customer.phone.ilike(`%${search}%`), customer.city.ilike(`%${search}%`))).orderBy((customer) => customer.name.asc()).limit(30).all()
    : await db.orm.public.Customer.orderBy((customer) => customer.name.asc()).limit(100).all();
  res.json(customers);
}));

app.get('/api/books', asyncRoute(async (req, res) => {
  const search = String(req.query['q'] ?? '').trim();
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const pageSize = 20;
  const activeBooksQuery = db.orm.public.Book.where({ active: true });
  const books = search
    ? await activeBooksQuery.where((book) => or(book.barcode.ilike(`%${search}%`), book.title.ilike(`%${search}%`), book.author.ilike(`%${search}%`), book.category.ilike(`%${search}%`))).orderBy((book) => book.title.asc()).limit(pageSize).offset((page - 1) * pageSize).all()
    : await activeBooksQuery.orderBy((book) => book.title.asc()).limit(pageSize).offset((page - 1) * pageSize).all();
  const activeBooks = books.map(publicBook);
  res.json({ items: activeBooks, page, pageSize, hasNextPage: activeBooks.length === pageSize });
}));

app.get('/api/books/barcode/:barcode', asyncRoute(async (req, res) => {
  const book = await db.orm.public.Book.where({ barcode: String(req.params['barcode']) }).first();
  if (!book || !book.active) {
    res.status(404).json({ message: 'Código de barras no registrado.' });
    return;
  }
  res.json(publicBook(book));
}));

app.post('/api/books', asyncRoute(async (req, res) => {
  const data = bookSchema.parse(req.body);
  const existing = await db.orm.public.Book.where({ barcode: data.barcode }).first();
  if (existing?.active) {
    res.status(409).json({ message: 'Ya existe un libro activo con ese código de barras.' });
    return;
  }
  if (existing && !existing.active) {
    const book = await db.orm.public.Book.where({ id: existing.id }).update({ ...data, cost: String(data.cost), salePrice: String(data.salePrice), active: true });
    res.status(200).json(publicBook(book));
    return;
  }
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

app.delete('/api/books/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const book = await db.orm.public.Book.where({ id }).update({ active: false });
  if (!book) { res.status(404).json({ message: 'Libro no encontrado.' }); return; }
  res.json({ message: 'Libro eliminado del inventario.' });
}));

app.get('/api/dashboard', asyncRoute(async (_req, res) => {
  const [books, sales, recentSales] = await Promise.all([
    db.orm.public.Book.where({ active: true }).all(),
    db.orm.public.Sale.where({ status: 'COMPLETED' }).all(),
    db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).limit(5).all(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((sale: any) => String(sale.createdAt).slice(0, 10) === today);
  const lowStock = books.filter((book: any) => book.stock > 0 && book.stock <= book.minStock);
  const outOfStock = books.filter((book: any) => book.stock === 0);
  res.json({
    bookCount: books.length,
    unitsAvailable: books.reduce((sum: number, book: any) => sum + book.stock, 0),
    lowStock: lowStock.slice(0, 5).map(publicBook),
    lowStockTotal: lowStock.length,
    outOfStock: outOfStock.slice(0, 5).map(publicBook),
    outOfStockTotal: outOfStock.length,
    todaySales: todaySales.length,
    todayTotal: todaySales.reduce((sum: number, sale: any) => sum + money(sale.subtotal) + money(sale.shippingAmount), 0),
    recentSales: recentSales.map((sale: any) => ({ ...sale, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount) })),
  });
}));
app.post('/api/inventory/entries', asyncRoute(async (req, res) => {
  const data = z.object({ bookId: idSchema, quantity: z.coerce.number().int().positive(), cost: moneySchema.optional(), userId: idSchema.default(1), reason: z.string().trim().max(200).default('Entrada de inventario') }).parse(req.body);
  const actorUserId = (req as Request & { user?: { id: number } }).user!.id;
  const result = await db.transaction(async (tx) => {

    const book = await tx.orm.public.Book.first({ id: data.bookId });
    if (!book || !book.active) throw new Error('Libro no encontrado.');
    const newStock = book.stock + data.quantity;
    const updated = await tx.orm.public.Book.where({ id: book.id }).update({ stock: newStock, ...(data.cost === undefined ? {} : { cost: String(data.cost) }) });
    await tx.orm.public.InventoryMovement.create({ bookId: book.id, userId: actorUserId, type: 'ENTRY', quantity: data.quantity, previousStock: book.stock, newStock, reason: data.reason });
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
  const actorUserId = (req as Request & { user?: { id: number } }).user!.id;
  const shippingAmount = data.shippingActive ? data.shippingAmount : 0;
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await db.transaction(async (tx) => {
        const books = await Promise.all(data.items.map((item) => tx.orm.public.Book.first({ id: item.bookId })));
        books.forEach((book, index) => {
          const item = data.items[index]!;
          if (!book || !book.active) throw new Error('Uno de los libros no existe.');
          if (book.stock < item.quantity) throw new Error(`Stock insuficiente para ${book.title}.`);
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

app.get('/api/sales', asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const pageSize = 20;
  const sales = await db.orm.public.Sale.orderBy((sale) => sale.createdAt.desc()).limit(pageSize).offset((page - 1) * pageSize).all();
  const result = await Promise.all(sales.map(async (sale: any) => {
    const customer = sale.customerId ? await db.orm.public.Customer.first({ id: sale.customerId }) : null;
    return { ...sale, customerName: customer?.name ?? null, subtotal: money(sale.subtotal), shippingAmount: money(sale.shippingAmount), total: money(sale.subtotal) + money(sale.shippingAmount) };
  }));
  res.json({ items: result, page, pageSize, hasNextPage: result.length === pageSize });
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

app.delete('/api/sales/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  await db.transaction(async (tx) => {
    const sale = await tx.orm.public.Sale.first({ id });
    if (!sale) throw new Error('Venta no encontrada.');
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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: 'Datos inválidos.', errors: error.flatten() }); return; }
  console.error('Unhandled API error', error);
  res.status(500).json({ message: 'Error interno del servidor.' });
});

const ensureDefaultUser = async () => {
  const adminPassword = process.env['INITIAL_ADMIN_PASSWORD'];
  const sellerPassword = process.env['INITIAL_SELLER_PASSWORD'];
  const user = await db.orm.public.User.first({ id: 1 });
  if (!user) {
    if (!adminPassword || adminPassword.length < 12) throw new Error('INITIAL_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
    await db.orm.public.User.create({ id: 1, name: 'Erick', username: 'admin', email: 'ericks.mejia2005@gmail.com', emailVerified: true, passwordHash: await bcrypt.hash(adminPassword, 12), role: 'ADMIN', active: true });
  } else if (user.name !== 'Erick') {
    await db.orm.public.User.where({ id: 1 }).update({ name: 'Erick' });
  }
  await db.orm.public.User.where({ id: 1 }).update({ email: 'ericks.mejia2005@gmail.com', emailVerified: true });
  const additionalUsers = [
    { id: 2, name: 'Filiblu DJ', username: 'filiblu_dj', email: 'filiblu_dj@hotmail.com' },
    { id: 3, name: 'Rosario Chayito', username: 'rosariochayito664', email: 'rosariochayito664@gmail.com' },
  ];
  for (const account of additionalUsers) {
    const existing = await db.orm.public.User.first({ id: account.id });
    if (!existing) {
      if (!sellerPassword || sellerPassword.length < 12) throw new Error('INITIAL_SELLER_PASSWORD debe tener al menos 12 caracteres.');
      await db.orm.public.User.create({ ...account, emailVerified: true, passwordHash: await bcrypt.hash(sellerPassword, 12), role: 'SELLER', active: true });
    }
    else await db.orm.public.User.where({ id: account.id }).update({ emailVerified: true });
  }
};

ensureDefaultUser()
  .then(() => app.listen(port, () => console.log(`ROS-TOB API listening on http://localhost:${port}`)))
  .catch((error) => { console.error('Unable to initialize ROS-TOB API', error); process.exitCode = 1; });