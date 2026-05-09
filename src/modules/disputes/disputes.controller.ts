import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, created, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function openDispute(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId          = req.user!.userId;
    const { orderId, reason } = req.body;

    const order = await prisma.orders.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('Commande introuvable', 404);
    if (order.buyer_id !== userId) throw new AppError('Accès refusé', 403);

    const validStatuses = ['paid', 'processing', 'shipped', 'delivered', 'completed'];
    if (!validStatuses.includes(order.status)) {
      throw new AppError('Impossible d\'ouvrir un litige pour cette commande', 400);
    }

    const existing = await prisma.disputes.findFirst({
      where: { order_id: orderId, status: { in: ['open', 'investigating'] } },
    });
    if (existing) throw new AppError('Un litige est déjà ouvert pour cette commande', 409);

    const dispute = await prisma.$transaction(async (tx) => {
      const d = await tx.disputes.create({
        data: {
          order_id:   orderId,
          opened_by:  userId,
          reason,
          status:     'open',
        },
      });

      // Mettre la commande en litige
      await tx.orders.update({
        where: { id: orderId },
        data:  { status: 'disputed' },
      });

      // Bloquer les fonds du vendeur
      await tx.seller_wallets.update({
        where: { shop_id: order.shop_id },
        data:  {
          balance_pending:   { decrement: order.seller_amount },
        },
      });

      return d;
    });

    return created(res, dispute, 'Litige ouvert — l\'admin va examiner votre demande');
  } catch (err) { next(err); }
}

export async function getMyDisputes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId              = req.user!.userId;
    const { page, limit, skip } = getPagination(req.query as any);

    const [disputes, total] = await Promise.all([
      prisma.disputes.findMany({
        where:   { opened_by: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take:    limit,
        include: {
          orders: { select: { id: true, total_amount: true, status: true } },
          dispute_evidences: true,
        },
      }),
      prisma.disputes.count({ where: { opened_by: userId } }),
    ]);

    return paginated(res, disputes, { page, limit, total });
  } catch (err) { next(err); }
}

export async function addEvidence(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId          = req.user!.userId;
    const { disputeId }   = req.params;
    const { fileUrl, description } = req.body;

    const dispute = await prisma.disputes.findUnique({ where: { id: disputeId } });
    if (!dispute)                   throw new AppError('Litige introuvable', 404);
    if (dispute.status === 'closed') throw new AppError('Ce litige est fermé', 400);

    const evidence = await prisma.dispute_evidences.create({
      data: {
        dispute_id:   disputeId,
        uploaded_by:  userId,
        file_url:     fileUrl,
        description,
      },
    });

    return created(res, evidence, 'Preuve ajoutée');
  } catch (err) { next(err); }
}

export async function getDisputeDetail(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId        = req.user!.userId;
    const { disputeId } = req.params;

    const dispute = await prisma.disputes.findUnique({
      where:   { id: disputeId },
      include: {
        dispute_evidences: true,
        orders: {
          include: {
            order_items: true,
            shops:       { select: { name: true } },
          },
        },
      },
    });

    if (!dispute) throw new AppError('Litige introuvable', 404);
    if (dispute.opened_by !== userId && req.user!.role !== 'admin') {
      throw new AppError('Accès refusé', 403);
    }

    return success(res, dispute);
  } catch (err) { next(err); }
}

// ADMIN — résoudre un litige
export async function resolveDispute(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const adminId         = req.user!.userId;
    const { disputeId }   = req.params;
    const { resolution, favorBuyer } = req.body;
    // favorBuyer: true = rembourser client, false = payer vendeur

    const dispute = await prisma.disputes.findUnique({
      where:   { id: disputeId },
      include: { orders: true },
    });
    if (!dispute) throw new AppError('Litige introuvable', 404);
    if (dispute.status === 'resolved') throw new AppError('Litige déjà résolu', 400);

    const order = dispute.orders;

    await prisma.$transaction(async (tx) => {
      await tx.disputes.update({
        where: { id: disputeId },
        data:  {
          status:      'resolved',
          resolution,
          resolved_by: adminId,
          resolved_at: new Date(),
        },
      });

      if (favorBuyer) {
        // Rembourser le client — la commande est annulée
        await tx.orders.update({
          where: { id: order.id },
          data:  { status: 'refunded' },
        });
        // Les fonds restent bloqués pour remboursement manuel
      } else {
        // Payer le vendeur — libérer les fonds
        await tx.seller_wallets.update({
          where: { shop_id: order.shop_id },
          data:  { balance_available: { increment: order.seller_amount } },
        });
        await tx.wallet_transactions.create({
          data: {
            shop_id:  order.shop_id,
            order_id: order.id,
            type:     'move_to_available',
            amount:   Number(order.seller_amount),
            note:     'Litige résolu en faveur du vendeur',
          },
        });
        await tx.orders.update({
          where: { id: order.id },
          data:  { status: 'completed' },
        });
      }
    });

    return success(res, null, 'Litige résolu');
  } catch (err) { next(err); }
}