import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, created } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getConversations(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;

    const conversations = await prisma.conversations.findMany({
      where: {
        OR: [{ participant_a: userId }, { participant_b: userId }],
      },
      orderBy: { last_message_at: 'desc' },
      include: {
        users_conversations_participant_aTouser: {
          select: { id: true, first_name: true, last_name: true, avatar_url: true },
        },
        users_conversations_participant_bTouser: {
          select: { id: true, first_name: true, last_name: true, avatar_url: true },
        },
        messages: {
          take:    1,
          orderBy: { created_at: 'desc' },
          select:  { content: true, created_at: true, is_read: true },
        },
      },
    });

    return success(res, conversations);
  } catch (err) { next(err); }
}

export async function createConversation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId                    = req.user!.userId;
    const { participantId, orderId, type } = req.body;

    // Vérifier si la conversation existe déjà
    const existing = await prisma.conversations.findFirst({
      where: {
        OR: [
          { participant_a: userId, participant_b: participantId },
          { participant_a: participantId, participant_b: userId },
        ],
        order_id: orderId ?? undefined,
      },
    });

    if (existing) return success(res, existing);

    const conversation = await prisma.conversations.create({
      data: {
        participant_a: userId,
        participant_b: participantId,
        order_id:      orderId ?? null,
        type:          type ?? 'buyer_seller',
      },
    });

    return created(res, conversation, 'Conversation créée');
  } catch (err) { next(err); }
}

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId             = req.user!.userId;
    const { conversationId } = req.params;

    const conversation = await prisma.conversations.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new AppError('Conversation introuvable', 404);
    if (
      conversation.participant_a !== userId &&
      conversation.participant_b !== userId
    ) throw new AppError('Accès refusé', 403);

    const messages = await prisma.messages.findMany({
      where:   { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
      include: {
        users: { select: { id: true, first_name: true, last_name: true, avatar_url: true } },
      },
    });

    // Marquer les messages non lus comme lus
    await prisma.messages.updateMany({
      where: {
        conversation_id: conversationId,
        sender_id:       { not: userId },
        is_read:         false,
      },
      data: { is_read: true, read_at: new Date() },
    });

    return success(res, messages);
  } catch (err) { next(err); }
}

export async function sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId             = req.user!.userId;
    const { conversationId } = req.params;
    const { content, imageUrl } = req.body;

    const conversation = await prisma.conversations.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new AppError('Conversation introuvable', 404);
    if (
      conversation.participant_a !== userId &&
      conversation.participant_b !== userId
    ) throw new AppError('Accès refusé', 403);

    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.messages.create({
        data: {
          conversation_id: conversationId,
          sender_id:       userId,
          content,
          image_url:       imageUrl ?? null,
        },
      });

      await tx.conversations.update({
        where: { id: conversationId },
        data:  { last_message_at: new Date() },
      });

      return m;
    });

    return created(res, message, 'Message envoyé');
  } catch (err) { next(err); }
}