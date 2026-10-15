import bcrypt from 'bcrypt';
import { db } from '../../prisma/db.js';

export const ensureDefaultUser = async () => {
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
