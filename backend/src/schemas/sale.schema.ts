import { z } from 'zod';
import { idSchema, moneySchema } from './common.schema.js';

export const saleSchema = z.object({
  customer: z.object({
    taxId: z.string().trim().max(40).optional(),
    name: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().optional().or(z.literal('')),
    address: z.string().trim().max(250).optional(),
    city: z.string().trim().max(100).optional(),
  }).optional(),
  sellerName: z.string().trim().max(160).optional(),
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
