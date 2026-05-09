import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, created, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function createShop(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const ownerId = req.user!.userId;

    const existing = await prisma.shops.findFirst({ where: { owner_id: ownerId } });
    if (existing) throw new AppError('Vous avez déjà une boutique', 409);

    const { name, description, phone, city, district, latitude, longitude } = req.body;

    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      + '-' + Date.now();

    const shop = await prisma.$transaction(async (tx) => {
      const s = await tx.shops.create({
        data: {
          owner_id:        ownerId,
          name,
          slug,
          description,
          phone,
          city,
          district,
          latitude,
          longitude,
          commission_rate: parseFloat(process.env.DEFAULT_COMMISSION_RATE || '7'),
        },
      });
      await tx.seller_wallets.create({ data: { shop_id: s.id } });
      return s;
    });

    return created(res, shop, 'Boutique créée');
  } catch (err) { next(err); }
}

export async function getShop(req: Request, res: Response, next: NextFunction) {
  try {
    const { shopId } = req.params;

    const shop = await prisma.shops.findUnique({
      where:   { id: shopId },
      include: {
        products: {
          where:   { is_active: true },
          take:    20,
          orderBy: { total_sold: 'desc' },
          include: {
            product_images: { where: { is_cover: true }, take: 1 },
          },
        },
        users: { select: { first_name: true, last_name: true, avatar_url: true } },
      },
    });
    if (!shop) throw new AppError('Boutique introuvable', 404);
    return success(res, shop);
  } catch (err) { next(err); }
}

export async function getShopDashboard(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const [shop, wallet, recentOrders, totalProducts, pendingOrders] = await Promise.all([
      prisma.shops.findUnique({ where: { id: shopId } }),
      prisma.seller_wallets.findUnique({ where: { shop_id: shopId } }),
      prisma.orders.findMany({
        where:   { shop_id: shopId },
        take:    5,
        orderBy: { created_at: 'desc' },
        include: {
          order_items: { select: { product_name: true, quantity: true } },
          users:       { select: { first_name: true, last_name: true } },
        },
      }),
      prisma.products.count({ where: { shop_id: shopId, is_active: true } }),
      prisma.orders.count({ where: { shop_id: shopId, status: 'paid' } }),
    ]);

    return success(res, {
      shop,
      wallet,
      recentOrders,
      stats: {
        totalProducts,
        pendingOrders,
        totalSales:    shop?.total_sales    ?? 0,
        averageRating: shop?.average_rating ?? 0,
      },
    });
  } catch (err) { next(err); }
}

export async function updateShop(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const shop = await prisma.shops.update({
      where: { id: shopId },
      data:  { ...req.body, updated_at: new Date() },
    });
    return success(res, shop, 'Boutique mise à jour');
  } catch (err) { next(err); }
}

export async function listShops(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as any);
    const { search, trustLevel } = req.query as any;

    const where: any = { is_active: true };
    if (search)     where.name        = { contains: search, mode: 'insensitive' };
    if (trustLevel) where.trust_level = trustLevel;

    const [shops, total] = await Promise.all([
      prisma.shops.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { total_sales: 'desc' },
        select: {
          id: true, name: true, slug: true, logo_url: true,
          trust_level: true, is_verified: true,
          average_rating: true, total_sales: true, city: true,
        },
      }),
      prisma.shops.count({ where }),
    ]);

    return paginated(res, shops, { page, limit, total });
  } catch (err) { next(err); }
}