import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  getNotifications, markAsRead,
  markAllAsRead, registerPushToken,
} from './notifications.controller';

const router = Router();

router.get('/',                  authenticate, getNotifications);
router.put('/:notifId/read',     authenticate, markAsRead);
router.put('/read-all',          authenticate, markAllAsRead);
router.post('/push-token',       authenticate, registerPushToken);

export default router;