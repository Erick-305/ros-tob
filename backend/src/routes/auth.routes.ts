import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../../prisma/db.js';
import { jwtSecret } from '../config/env.js';
import { hashCode } from '../lib/crypto.js';
import { sendCode } from '../lib/mailer.js';
import { asyncRoute } from '../middleware/async-route.js';
import { recoveryLimiter } from '../middleware/rate-limiters.js';

export const authRouter = Router();

authRouter.post('/login', asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (user && !user.active) { res.status(403).json({ message: 'Esta cuenta está inactiva. Solicita al administrador que la active.' }); return; }
  if (user && user.email && !user.emailVerified) { res.status(403).json({ message: 'Debes verificar tu correo antes de iniciar sesión.' }); return; }
  const valid = user ? await bcrypt.compare(data.password, user.passwordHash) : false;
  if (!user || !valid) { res.status(401).json({ message: 'Usuario o contraseña incorrectos.' }); return; }
  const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, jwtSecret, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role } });
}));

authRouter.post('/forgot-password', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user?.email) { res.status(200).json({ message: 'Si la cuenta existe, recibirás instrucciones en su correo.' }); return; }
  const code = crypto.randomInt(100000, 1000000).toString();
  await db.orm.public.User.where({ id: user.id }).update({ resetCode: hashCode(code), resetExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  res.json({ message: 'Te enviamos un código de recuperación al correo registrado.' });
  sendCode(user.email, 'Recuperación de contraseña ROS-TOB', code, 'recuperar tu contraseña').catch((error) => console.error('No se pudo enviar el correo de recuperación', error));
}));

authRouter.post('/send-verification', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user?.email || user.emailVerified) { res.status(200).json({ message: 'Si la cuenta necesita verificación, recibirás un código en su correo.' }); return; }
  const code = crypto.randomInt(100000, 1000000).toString();
  await db.orm.public.User.where({ id: user.id }).update({ verificationCode: hashCode(code), verificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  res.json({ message: 'Te enviamos un código de verificación al correo registrado.' });
  sendCode(user.email, 'Verificación de correo ROS-TOB', code, 'verificar tu correo').catch((error) => console.error('No se pudo enviar el correo de verificación', error));
}));

authRouter.post('/verify-email', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1), code: z.string().trim().length(6) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user || user.emailVerified || user.verificationCode !== hashCode(data.code) || !user.verificationExpiresAt || new Date(user.verificationExpiresAt) < new Date()) { res.status(400).json({ message: 'El código de verificación no es válido o expiró.' }); return; }
  await db.orm.public.User.where({ id: user.id }).update({ emailVerified: true, verificationCode: null, verificationExpiresAt: null });
  res.json({ message: 'Correo verificado. Ya puedes iniciar sesión.' });
}));

authRouter.post('/reset-password', recoveryLimiter, asyncRoute(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(1), code: z.string().trim().length(6), password: z.string().min(12).max(100) }).parse(req.body);
  const user = await db.orm.public.User.where((candidate) => or(candidate.username.ilike(data.identifier), candidate.email.ilike(data.identifier))).first();
  if (!user || user.resetCode !== hashCode(data.code) || !user.resetExpiresAt || new Date(user.resetExpiresAt) < new Date()) { res.status(400).json({ message: 'El código de recuperación no es válido o expiró.' }); return; }
  await db.orm.public.User.where({ id: user.id }).update({ passwordHash: await bcrypt.hash(data.password, 12), resetCode: null, resetExpiresAt: null, emailVerified: true });
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
}));
