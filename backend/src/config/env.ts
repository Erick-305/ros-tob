const rawJwtSecret = process.env['JWT_SECRET'];
if (!rawJwtSecret || rawJwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres.');
}

export const jwtSecret = rawJwtSecret;
export const port = Number(process.env['PORT'] ?? 3000);
export const allowedOrigins = (process.env['FRONTEND_URL'] ?? 'https://ros-tob.web.app,http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
