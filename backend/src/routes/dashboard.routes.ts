import { Router } from 'express';
import { db } from '../../prisma/db.js';
import { money, publicBook } from '../lib/helpers.js';
import { asyncRoute } from '../middleware/async-route.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', asyncRoute(async (_req, res) => {
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
