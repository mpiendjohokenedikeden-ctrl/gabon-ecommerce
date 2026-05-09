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

export const io = new SocketServer(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
});
setupSocketIO(io);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
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