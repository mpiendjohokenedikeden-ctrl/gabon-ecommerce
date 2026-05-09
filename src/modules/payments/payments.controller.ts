import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function initiatePayment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const buyerId = req.user!.userId;
    const { orderId, method } = req.body;

    const order = await prisma.orders.findUnique({ where: { id: orderId } });
    if (!order)                    throw new AppError('Commande introuvable', 404);
    if (order.buyer_id !== buyerId) throw new AppError('Accès refusé', 403);
    if (order.status !== 'pending') throw new AppError('Commande déjà payée ou annulée', 400);

    // Créer l'entrée paiement en attente
    const payment = await prisma.payments.create({
      data: {
        order_id:  orderId,
        buyer_id:  buyerId,
        amount:    order.total_amount,
        currency:  'XAF',
        method,
        status:    'pending',
      },
    });

    // TODO: selon le method, appeler l'API opérateur
    // Airtel Money  → appel API Airtel
    // Moov Money    → appel API Moov
    // MobiCash      → appel API MobiCash
    // visa          → appel API Stripe
    // Pour l'instant on retourne les infos pour que le client finalise

    const instructions: Record<string, string> = {
      airtel_money:  `Envoyez ${order.total_amount} FCFA au +241 XX XX XX XX avec la référence ${payment.id}`,
      moov_money:    `Envoyez ${order.total_amount} FCFA au +241 XX XX XX XX avec la référence ${payment.id}`,
      mobicash:      `Envoyez ${order.total_amount} FCFA au +241 XX XX XX XX avec la référence ${payment.id}`,
      bank_transfer: `Virement bancaire de ${order.total_amount} FCFA — Réf : ${payment.id}`,
      visa:          `Paiement carte — redirection vers Stripe`,
    };

    return success(res, {
      paymentId:    payment.id,
      amount:       order.total_amount,
      currency:     'XAF',
      method,
      instruction:  instructions[method] ?? 'Suivez les instructions de votre opérateur',
      reference:    payment.id,
    }, 'Paiement initié');
  } catch (err) { next(err); }
}

export async function confirmPayment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { paymentId } = req.params;
    const { externalRef } = req.body;

    const payment = await prisma.payments.findUnique({ where: { id: paymentId } });
    if (!payment)                    throw new AppError('Paiement introuvable', 404);
    if (payment.status === 'success') throw new AppError('Paiement déjà confirmé', 400);

    await prisma.$transaction(async (tx) => {
      // Marquer le paiement comme réussi
      await tx.payments.update({
        where: { id: paymentId },
        data:  {
          status:       'success',
          external_ref: externalRef,
          paid_at:      new Date(),
        },
      });

      // Mettre à jour la commande
      await tx.orders.update({
        where: { id: payment.order_id },
        data:  { status: 'paid' },
      });

      // Créditer le solde en attente du vendeur (escrow)
      const order = await tx.orders.findUnique({ where: { id: payment.order_id } });
      if (order) {
        await tx.seller_wallets.update({
          where: { shop_id: order.shop_id },
          data:  { balance_pending: { increment: order.seller_amount } },
        });

        await tx.wallet_transactions.create({
          data: {
            shop_id:  order.shop_id,
            order_id: order.id,
            type:     'credit_pending',
            amount:   Number(order.seller_amount),
            note:     'Paiement reçu — en attente de validation livraison',
          },
        });
      }
    });

    return success(res, null, 'Paiement confirmé — commande en préparation');
  } catch (err) { next(err); }
}

// Webhook appelé automatiquement par l'opérateur télécom
export async function webhookMobileMoney(req: Request, res: Response, next: NextFunction) {
  try {
    const { reference, status, operator } = req.body;

    const payment = await prisma.payments.findUnique({ where: { id: reference } });
    if (!payment) return res.status(200).json({ received: true });

    if (status === 'SUCCESS' && payment.status === 'pending') {
      await prisma.$transaction(async (tx) => {
        await tx.payments.update({
          where: { id: reference },
          data:  { status: 'success', paid_at: new Date() },
        });

        await tx.orders.update({
          where: { id: payment.order_id },
          data:  { status: 'paid' },
        });

        const order = await tx.orders.findUnique({ where: { id: payment.order_id } });
        if (order) {
          await tx.seller_wallets.update({
            where: { shop_id: order.shop_id },
            data:  { balance_pending: { increment: order.seller_amount } },
          });
          await tx.wallet_transactions.create({
            data: {
              shop_id:  order.shop_id,
              order_id: order.id,
              type:     'credit_pending',
              amount:   Number(order.seller_amount),
              note:     `Paiement ${operator} confirmé`,
            },
          });
        }
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) { next(err); }
}

export async function getPaymentHistory(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const buyerId = req.user!.userId;

    const payments = await prisma.payments.findMany({
      where:   { buyer_id: buyerId },
      orderBy: { created_at: 'desc' },
      include: {
        orders: { select: { id: true, status: true, total_amount: true } },
      },
    });

    return success(res, payments);
  } catch (err) { next(err); }
}