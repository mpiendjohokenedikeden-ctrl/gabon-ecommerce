import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success } from '../../utils/response';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getNotifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;

    const notifications = await prisma.notifications.findMany({
      where:   { user_id: userId },
      orderBy: { created_at: 'desc' },
      take:    50,
    });

    const unreadCount = await prisma.notifications.count({
      where: { user_id: userId, is_read: false },
    });

    return success(res, { notifications, unreadCount });
  } catch (err) { next(err); }
}

export async function markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId  = req.user!.userId;
    const { notifId } = req.params;

    await prisma.notifications.updateMany({
      where: { id: notifId, user_id: userId },
      data:  { is_read: true },
    });

    return success(res, null, 'Notification lue');
  } catch (err) { next(err); }
}

export async function markAllAsRead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;

    await prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data:  { is_read: true },
    });

    return success(res, null, 'Toutes les notifications lues');
  } catch (err) { next(err); }
}

export async function registerPushToken(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId             = req.user!.userId;
    const { token, platform } = req.body;

    await prisma.push_tokens.upsert({
      where:  { token },
      update: { user_id: userId, platform },
      create: { user_id: userId, token, platform },
    });

    return success(res, null, 'Token enregistré');
  } catch (err) { next(err); }
}