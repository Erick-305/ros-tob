import { z } from 'zod';

export const idSchema = z.coerce.number().int().positive();
export const moneySchema = z.coerce.number().finite().nonnegative();
