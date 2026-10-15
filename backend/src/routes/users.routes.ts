import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../prisma/db.js';
import { asyncRoute } from '../middleware/async-route.js';
import { requireAdmin } from '../middleware/auth.js';
import { idSchema } from '../schemas/common.schema.js';

export const usersRouter = Router();

usersRouter.get('/', requireAdmin, asyncRoute(async (_req, res) => {
  const users = await db.orm.public.User.orderBy((user) => user.id.asc()).all();
  res.json(users.map((user: any) => ({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, active: user.active })));
}));

usersRouter.patch('/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const id = idSchema.parse(req.params['id']);
  const data = z.object({ active: z.boolean() }).parse(req.body);
  if (id === 1) { res.status(400).json({ message: 'La cuenta de Erick no se puede desactivar.' }); return; }
  const user = await db.orm.public.User.where({ id }).update({ active: data.active });
  if (!user) { res.status(404).json({ message: 'Usuario no encontrado.' }); return; }
  res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, active: user.active });
}));
