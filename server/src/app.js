import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { globalLimiter, authLimiter, errorHandler, notFoundHandler } from './middleware/index.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import subscriptionRoutes from './routes/subscriptions.routes.js';
import ticketRoutes from './routes/tickets.routes.js';
import businessRoutes from './routes/business.routes.js';
import auditRoutes from './routes/audit.routes.js';
import healthRoutes from './routes/health.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors({
    origin(origin, cb) {
      if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return cb(null, true);
      cb(new Error('منشا درخواست در فهرست مجاز نیست'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));

  app.use(express.json({ limit: config.jsonLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.jsonLimit }));

  app.use(globalLimiter);
  app.use('/api/v2', healthRoutes);
  app.use('/api/v2/auth', authLimiter, authRoutes);
  app.use('/api/v2/users', userRoutes);
  app.use('/api/v2', subscriptionRoutes);
  app.use('/api/v2/tickets', ticketRoutes);
  app.use('/api/v2/business', businessRoutes);
  app.use('/api/v2/audit', auditRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
