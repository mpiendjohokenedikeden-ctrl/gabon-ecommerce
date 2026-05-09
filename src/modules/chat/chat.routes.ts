import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth.middleware';
import {
  getConversations, createConversation,
  getMessages, sendMessage,
} from './chat.controller';

const router = Router();

router.get('/conversations',                          authenticate, getConversations);
router.post('/conversations', authenticate, [
  body('participantId').isUUID().withMessage('participantId invalide'),
], validate, createConversation);
router.get('/conversations/:conversationId/messages',  authenticate, getMessages);
router.post('/conversations/:conversationId/messages', authenticate, [
  body('content').optional().notEmpty(),
], validate, sendMessage);

export default router;