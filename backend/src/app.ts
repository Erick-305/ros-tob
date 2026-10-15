import 'dotenv/config';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { allowedOrigins } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiLimiter, authLimiter } from './middleware/rate-limiters.js';
import { authRouter } from './routes/auth.routes.js';
import { booksRouter } from './routes/books.routes.js';
import { customersRouter } from './routes/customers.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { inventoryRouter } from './routes/inventory.routes.js';
import { salesRouter } from './routes/sales.routes.js';
import { usersRouter } from './routes/users.routes.js';

export const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true, service: 'ros-tob-api' }));

// Rutas públicas de autenticación, antes del guard de sesión.
app.use('/api/auth', authRouter);

app.use('/api', authenticate);

app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/books', booksRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api', inventoryRouter);
app.use('/api/sales', salesRouter);

app.use(errorHandler);
