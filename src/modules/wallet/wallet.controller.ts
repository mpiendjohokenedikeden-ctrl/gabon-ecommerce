import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getMyWallet(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const wallet = await prisma.seller_wallets.findUnique({
      where:   { shop_id: shopId },
      include: { shops: { select: { name: true, commission_rate: true } } },
    });
    if (!wallet) throw new AppError('Portefeuille introuvable', 404);

    return success(res, {
      shopName:         wallet.shops.name,
      commissionRate:   wallet.shops.commission_rate,
      balancePending:   wallet.balance_pending,
      balanceAvailable: wallet.balance_available,
      balanceWithdrawn: wallet.balance_withdrawn,
    });
  } catch (err) { next(err); }
}

export async function getWalletHistory(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const { page, limit, skip } = getPagination(req.query as any);

    const [transactions, total] = await Promise.all([
      prisma.wallet_transactions.findMany({
        where:   { shop_id: shopId },
        orderBy: { created_at: 'desc' },
        skip,
        take:    limit,
        include: { orders: { select: { id: true, status: true } } },
      }),
      prisma.wallet_transactions.count({ where: { shop_id: shopId } }),
    ]);

    return paginated(res, transactions, { page, limit, total });
  } catch (err) { next(err); }
}

export async function requestWithdrawal(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const { amount, method, accountNumber, accountName } = req.body;

    const wallet = await prisma.seller_wallets.findUnique({ where: { shop_id: shopId } });
    if (!wallet) throw new AppError('Portefeuille introuvable', 404);

    const setting = await prisma.platform_settings.findUnique({
      where: { key: 'min_withdrawal_amount' },
    });
    const minimum = parseFloat(setting?.value || '5000');

    if (amount < minimum) {
      throw new AppError(`Montant minimum de retrait : ${minimum} FCFA`, 400);
    }
    if (amount > parseFloat(wallet.balance_available.toString())) {
      throw new AppError('Solde disponible insuffisant', 400);
    }

    const pending = await prisma.withdrawal_requests.findFirst({
      where: { shop_id: shopId, status: 'pending' },
    });
    if (pending) throw new AppError('Une demande de retrait est déjà en cours', 400);

    const result = await prisma.$transaction(async (tx) => {
      await tx.seller_wallets.update({
        where: { shop_id: shopId },
        data:  { balance_available: { decrement: amount } },
      });

      const withdrawal = await tx.withdrawal_requests.create({
        data: {
          shop_id:        shopId,
          amount,
          method,
          account_number: accountNumber,
          account_name:   accountName,
          status:         'pending',
        },
      });

      await tx.wallet_transactions.create({
        data: {
          shop_id: shopId,
          type:    'withdrawal',
          amount:  -amount,
          note:    `Retrait vers ${method} — ${accountNumber}`,
        },
      });

      return withdrawal;
    });

    return success(res, result, 'Demande soumise. Traitement sous 24-48h.');
  } catch (err) { next(err); }
}

export async function processWithdrawal(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { withdrawalId } = req.params;
    const { action, adminNote } = req.body;
    const adminId = req.user!.userId;

    const withdrawal = await prisma.withdrawal_requests.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal)                   throw new AppError('Demande introuvable', 404);
    if (withdrawal.status !== 'pending') throw new AppError('Demande déjà traitée', 400);

    if (action === 'approve') {
      await prisma.$transaction(async (tx) => {
        await tx.withdrawal_requests.update({
          where: { id: withdrawalId },
          data:  {
            status:       'approved',
            admin_note:   adminNote,
            processed_by: adminId,
            processed_at: new Date(),
          },
        });
        await tx.seller_wallets.update({
          where: { shop_id: withdrawal.shop_id },
          data:  { balance_withdrawn: { increment: withdrawal.amount } },
        });
      });
      return success(res, null, 'Retrait approuvé');
    }

    if (action === 'reject') {
      await prisma.$transaction(async (tx) => {
        await tx.seller_wallets.update({
          where: { shop_id: withdrawal.shop_id },
          data:  { balance_available: { increment: withdrawal.amount } },
        });
        await tx.withdrawal_requests.update({
          where: { id: withdrawalId },
          data:  {
            status:       'rejected',
            admin_note:   adminNote,
            processed_by: adminId,
            processed_at: new Date(),
          },
        });
        await tx.wallet_transactions.create({
          data: {
            shop_id: withdrawal.shop_id,
            type:    'admin_adjustment',
            amount:  Number(withdrawal.amount),
            note:    `Retrait refusé : ${adminNote}`,
          },
        });
      });
      return success(res, null, 'Retrait refusé — fonds recrédités');
    }

    throw new AppError('Action invalide', 400);
  } catch (err) { next(err); }
}

export async function getWithdrawals(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const withdrawals = await prisma.withdrawal_requests.findMany({
      where:   { shop_id: shopId },
      orderBy: { requested_at: 'desc' },
    });
    return success(res, withdrawals);
  } catch (err) { next(err); }
}