import { Router } from 'express';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../../prisma/db.js';
import { publicBook } from '../lib/helpers.js';
import { asyncRoute } from '../middleware/async-route.js';
import { bookSchema } from '../schemas/book.schema.js';
import { idSchema } from '../schemas/common.schema.js';

export const booksRouter = Router();

booksRouter.get('/', asyncRoute(async (req, res) => {
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

booksRouter.get('/barcode/:barcode', asyncRoute(async (req, res) => {
  const book = await db.orm.public.Book.where({ barcode: String(req.params['barcode']) }).first();
  if (!book || !book.active) {
    res.status(404).json({ message: 'Código de barras no registrado.' });
    return;
  }
  res.json(publicBook(book));
}));

booksRouter.post('/', asyncRoute(async (req, res) => {
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

booksRouter.patch('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const data = bookSchema.partial().parse(req.body);
  const current = await db.orm.public.Book.where({ id }).first();
  if (!current || !current.active) { res.status(404).json({ message: 'Libro no encontrado.' }); return; }
  if (data.barcode !== undefined && data.barcode !== current.barcode) {
    const duplicate = await db.orm.public.Book.where({ barcode: data.barcode }).first();
    if (duplicate) {
      res.status(409).json({ message: duplicate.active ? 'Ya existe un libro activo con ese código de barras.' : 'Ese código de barras pertenece a un libro eliminado. Regístralo de nuevo para reactivarlo.' });
      return;
    }
  }
  const update = Object.fromEntries(Object.entries({ ...data, ...(data.cost === undefined ? {} : { cost: String(data.cost) }), ...(data.salePrice === undefined ? {} : { salePrice: String(data.salePrice) }) }).filter(([, value]) => value !== undefined));
  const book = await db.orm.public.Book.where({ id }).update(update);
  res.json(publicBook(book));
}));

booksRouter.delete('/:id', asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const book = await db.orm.public.Book.where({ id }).update({ active: false });
  if (!book) { res.status(404).json({ message: 'Libro no encontrado.' }); return; }
  res.json({ message: 'Libro eliminado del inventario.' });
}));
