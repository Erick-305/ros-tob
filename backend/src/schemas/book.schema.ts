import { z } from 'zod';
import { moneySchema } from './common.schema.js';

export const bookSchema = z.object({
  barcode: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(100),
  cost: moneySchema,
  salePrice: moneySchema,
  stock: z.coerce.number().int().nonnegative(),
  minStock: z.coerce.number().int().nonnegative(),
});
