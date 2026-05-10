import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { setupSocketIO } from './config/socket';

import authRoutes         from './modules/auth/auth.routes';
import userRoutes         from './modules/users/users.routes';
import shopRoutes         from './modules/shops/shops.routes';
import productRoutes      from './modules/products/products.routes';
import orderRoutes        from './modules/orders/orders.routes';
import paymentRoutes      from './modules/payments/payments.routes';
import walletRoutes       from './modules/wallet/wallet.routes';
import deliveryRoutes     from './modules/delivery/delivery.routes';
import chatRoutes         from './modules/chat/chat.routes';
import importRoutes       from './modules/import/import.routes';
import disputeRoutes      from './modules/disputes/disputes.routes';
import adminRoutes        from './modules/admin/admin.routes';
import notifRoutes        from './modules/notifications/notifications.routes';

dotenv.config();

const app        = express();
const httpServer = createServer(app);

// CORS — accepte toutes les origines localhost + IP réseau
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://192.168.1.77:3000',
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origine (mobile, Postman)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === 'string') return allowed === origin;
      if (allowed instanceof RegExp) return allowed.test(origin);
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, true); // En dev on accepte tout
    }
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

export const io = new SocketServer(httpServer, {
  cors: {
    origin:      '*',
    credentials: false,
  },
});
setupSocketIO(io);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Pre-flight pour toutes les routes
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

const API = `/api/${process.env.API_VERSION || 'v1'}`;

app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/users`,         userRoutes);
app.use(`${API}/shops`,         shopRoutes);
app.use(`${API}/products`,      productRoutes);
app.use(`${API}/orders`,        orderRoutes);
app.use(`${API}/payments`,      paymentRoutes);
app.use(`${API}/wallet`,        walletRoutes);
app.use(`${API}/delivery`,      deliveryRoutes);
app.use(`${API}/chat`,          chatRoutes);
app.use(`${API}/import`,        importRoutes);
app.use(`${API}/disputes`,      disputeRoutes);
app.use(`${API}/admin`,         adminRoutes);
app.use(`${API}/notifications`, notifRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Serveur démarré — http://localhost:${PORT}${API}\n`);
});