import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt';

export function setupSocketIO(io: Server) {

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token manquant'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Token invalide'));
    socket.data.userId = payload.userId;
    socket.data.role   = payload.role;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`🔌 Connecté : ${userId}`);

    socket.join(`user:${userId}`);

    // CHAT
    socket.on('join_conversation', (conversationId: string) => {
      socket.join(`conv:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conv:${conversationId}`);
    });

    socket.on('send_message', (data: {
      conversationId: string;
      content?: string;
      imageUrl?: string;
    }) => {
      io.to(`conv:${data.conversationId}`).emit('new_message', {
        conversationId: data.conversationId,
        senderId:       userId,
        content:        data.content,
        imageUrl:       data.imageUrl,
        createdAt:      new Date().toISOString(),
      });
    });

    socket.on('typing', (conversationId: string) => {
      socket.to(`conv:${conversationId}`).emit('user_typing', {
        conversationId,
        userId,
      });
    });

    socket.on('mark_read', (conversationId: string) => {
      socket.to(`conv:${conversationId}`).emit('messages_read', {
        conversationId,
        userId,
      });
    });

    // LIVRAISON GPS
    socket.on('driver_location', (data: {
      orderId: string;
      latitude: number;
      longitude: number;
    }) => {
      io.to(`order:${data.orderId}`).emit('driver_position', {
        orderId:   data.orderId,
        latitude:  data.latitude,
        longitude: data.longitude,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('track_order', (orderId: string) => {
      socket.join(`order:${orderId}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Déconnecté : ${userId}`);
    });
  });
}