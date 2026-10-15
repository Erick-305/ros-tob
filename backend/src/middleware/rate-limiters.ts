import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, message: { message: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.' } });

export const authLimiter = rateLimit({ windowMs: 60 * 1000, limit: 5, message: { message: 'Has alcanzado el máximo de 5 intentos. Espera 1 minuto antes de volver a intentar.' } });

export const recoveryLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => String(req.body?.identifier ?? '').trim().toLowerCase() || ipKeyGenerator(req.ip ?? 'unknown'),
  message: { message: 'Demasiadas solicitudes de recuperación. Espera 5 minutos antes de volver a intentarlo.' },
});
