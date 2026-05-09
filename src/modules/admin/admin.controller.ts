import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getDashboard(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const [
      totalUsers, totalSellers, totalOrders,
      totalRevenue, pendingWithdrawals, openDisputes,
      recentOrders,
    ] = await Promise.all([
      prisma.users.count({ where: { role: 'buyer' } }),
      prisma.users.count({ where: { role: 'seller' } }),
      prisma.orders.count(),
      prisma.orders.aggregate({
        where:  { status: { in: ['completed', 'delivered'] } },
        _sum:   { commission_amount: true },
      }),
      prisma.withdrawal_requests.count({ where: { status: 'pending' } }),
      prisma.disputes.count({ where: { status: { in: ['open', 'investigating'] } } }),
      prisma.orders.findMany({
        take:    10,
        orderBy: { created_at: 'desc' },
        include: {
          users: { select: { first_name: true, last_name: true } },
          shops: { select: { name: true } },
        },
      }),
    ]);

    return success(res, {
      stats: {
        totalUsers,
        totalSellers,
        totalOrders,
        totalRevenue:       totalRevenue._sum.commission_amount ?? 0,
        pendingWithdrawals,
        openDisputes,
      },
      recentOrders,
    });
  } catch (err) { next(err); }
}

export async function getAllUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as any);
    const { role, search }      = req.query as any;

    const where: any = {};
    if (role)   where.role  = role;
    if (search) where.OR    = [
      { email:      { contains: search, mode: 'insensitive' } },
      { phone:      { contains: search } },
      { first_name: { contains: search, mode: 'insensitive' } },
    ];

    const [users, total] = await Promise.all([
      prisma.users.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        select:  {
          id: true, email: true, phone: true, role: true,
          first_name: true, last_name: true,
          is_active: true, is_suspended: true, created_at: true,
        },
      }),
      prisma.users.count({ where }),
    ]);

    return paginated(res, users, { page, limit, total });
  } catch (err) { next(err); }
}

export async function suspendUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { userId }  = req.params;
    const { reason }  = req.body;

    await prisma.users.update({
      where: { id: userId },
      data:  { is_suspended: true, suspension_reason: reason },
    });

    return success(res, null, 'Utilisateur suspendu');
  } catch (err) { next(err); }
}

export async function reactivateUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;

    await prisma.users.update({
      where: { id: userId },
      data:  { is_suspended: false, suspension_reason: null },
    });

    return success(res, null, 'Utilisateur réactivé');
  } catch (err) { next(err); }
}

export async function getAllOrders(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as any);
    const { status }            = req.query as any;

    const where: any = {};
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.orders.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        include: {
          users: { select: { first_name: true, last_name: true, phone: true } },
          shops: { select: { name: true } },
        },
      }),
      prisma.orders.count({ where }),
    ]);

    return paginated(res, orders, { page, limit, total });
  } catch (err) { next(err); }
}

export async function getAllWithdrawals(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as any);
    const { status }            = req.query as any;

    const where: any = {};
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal_requests.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { requested_at: 'desc' },
        include: {
          shops: { select: { name: true } },
        },
      }),
      prisma.withdrawal_requests.count({ where }),
    ]);

    return paginated(res, withdrawals, { page, limit, total });
  } catch (err) { next(err); }
}

export async function getAllDisputes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as any);
    const { status }            = req.query as any;

    const where: any = {};
    if (status) where.status = status;

    const [disputes, total] = await Promise.all([
      prisma.disputes.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        include: {
          orders: { select: { id: true, total_amount: true } },
          users:  { select: { first_name: true, last_name: true } },
        },
      }),
      prisma.disputes.count({ where }),
    ]);

    return paginated(res, disputes, { page, limit, total });
  } catch (err) { next(err); }
}

export async function verifyShop(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { shopId }    = req.params;
    const { trustLevel } = req.body;

    const validLevels = ['gray', 'blue', 'purple', 'gold'];
    if (!validLevels.includes(trustLevel)) {
      throw new AppError('Niveau de confiance invalide', 400);
    }

    await prisma.shops.update({
      where: { id: shopId },
      data:  {
        is_verified: true,
        trust_level: trustLevel,
        updated_at:  new Date(),
      },
    });

    return success(res, null, 'Boutique vérifiée');
  } catch (err) { next(err); }
}

export async function getSettings(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const settings = await prisma.platform_settings.findMany();
    const result   = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return success(res, result);
  } catch (err) { next(err); }
}

export async function updateSetting(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { key }   = req.params;
    const { value } = req.body;

    await prisma.platform_settings.upsert({
      where:  { key },
      update: { value, updated_at: new Date() },
      create: { key, value },
    });

    return success(res, null, 'Paramètre mis à jour');
  } catch (err) { next(err); }
}