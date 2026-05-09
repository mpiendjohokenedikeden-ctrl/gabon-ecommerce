import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, created, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, skip } = getPagination(req.query as any);
    const { categoryId, shopId, minPrice, maxPrice, search, sortBy } = req.query as any;

    const where: any = { is_active: true };
    if (categoryId) where.category_id = categoryId;
    if (shopId)     where.shop_id     = shopId;
    if (search)     where.name        = { contains: search, mode: 'insensitive' };
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    let orderBy: any = { created_at: 'desc' };
    if (sortBy === 'price_asc')  orderBy = { price: 'asc' };
    if (sortBy === 'price_desc') orderBy = { price: 'desc' };
    if (sortBy === 'rating')     orderBy = { average_rating: 'desc' };
    if (sortBy === 'popular')    orderBy = { total_sold: 'desc' };

    const [products, total] = await Promise.all([
      prisma.products.findMany({
        where,
        skip,
        take:    limit,
        orderBy,
        include: {
          product_images: { where: { is_cover: true }, take: 1 },
          shops:          { select: { name: true, slug: true, trust_level: true } },
          categories:     { select: { name: true, slug: true } },
        },
      }),
      prisma.products.count({ where }),
    ]);

    return paginated(res, products, { page, limit, total });
  } catch (err) { next(err); }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.params;

    const product = await prisma.products.findUnique({
      where:   { id: productId },
      include: {
        product_images:   true,
        product_videos:   true,
        product_variants: true,
        shops: {
          select: {
            id: true, name: true, slug: true, logo_url: true,
            trust_level: true, is_verified: true,
            average_rating: true, total_sales: true,
          },
        },
        categories: { select: { id: true, name: true, slug: true } },
        reviews: {
          take:    5,
          orderBy: { created_at: 'desc' },
          include: {
            users: { select: { first_name: true, last_name: true, avatar_url: true } },
          },
        },
      },
    });

    if (!product) throw new AppError('Produit introuvable', 404);

    await prisma.products.update({
      where: { id: productId },
      data:  { view_count: { increment: 1 } },
    });

    return success(res, product);
  } catch (err) { next(err); }
}

export async function createProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const {
      name, categoryId, description, price, promoPrice,
      stock, weightKg, warrantyMonths, condition,
      isImported, originCountry, variants,
    } = req.body;

    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      + '-' + Date.now();

    const product = await prisma.products.create({
      data: {
        shop_id:         shopId,
        category_id:     categoryId,
        name,
        slug,
        description,
        price,
        promo_price:     promoPrice,
        stock:           stock ?? 0,
        weight_kg:       weightKg,
        warranty_months: warrantyMonths ?? 0,
        condition:       condition ?? 'new',
        is_imported:     isImported ?? false,
        origin_country:  originCountry,
        product_variants: variants?.length
          ? { create: variants }
          : undefined,
      },
      include: { product_variants: true },
    });

    return created(res, product, 'Produit créé');
  } catch (err) { next(err); }
}

export async function updateProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId        = req.user!.shopId;
    const { productId } = req.params;

    const product = await prisma.products.findUnique({ where: { id: productId } });
    if (!product)                throw new AppError('Produit introuvable', 404);
    if (product.shop_id !== shopId) throw new AppError('Accès refusé', 403);

    const updated = await prisma.products.update({
      where: { id: productId },
      data:  { ...req.body, updated_at: new Date() },
    });
    return success(res, updated, 'Produit mis à jour');
  } catch (err) { next(err); }
}

export async function deleteProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId        = req.user!.shopId;
    const { productId } = req.params;

    const product = await prisma.products.findUnique({ where: { id: productId } });
    if (!product)                throw new AppError('Produit introuvable', 404);
    if (product.shop_id !== shopId) throw new AppError('Accès refusé', 403);

    await prisma.products.update({
      where: { id: productId },
      data:  { is_active: false },
    });
    return success(res, null, 'Produit supprimé');
  } catch (err) { next(err); }
}

export async function addReview(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const reviewerId    = req.user!.userId;
    const { productId } = req.params;
    const { orderId, rating, comment, images } = req.body;

    const order = await prisma.orders.findFirst({
      where: {
        id:       orderId,
        buyer_id: reviewerId,
        status:   'completed',
        order_items: { some: { product_id: productId } },
      },
    });
    if (!order) throw new AppError('Vous devez avoir acheté ce produit pour laisser un avis', 403);

    const existing = await prisma.reviews.findFirst({
      where: { order_id: orderId, product_id: productId, reviewer_id: reviewerId },
    });
    if (existing) throw new AppError('Avis déjà soumis pour cette commande', 409);

    const product = await prisma.products.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Produit introuvable', 404);

    const review = await prisma.$transaction(async (tx) => {
      const r = await tx.reviews.create({
        data: {
          order_id:    orderId,
          product_id:  productId,
          reviewer_id: reviewerId,
          shop_id:     order.shop_id,
          rating,
          comment,
          images:      images ?? [],
        },
      });

      const agg = await tx.reviews.aggregate({
        where:  { product_id: productId },
        _avg:   { rating: true },
        _count: { rating: true },
      });
      await tx.products.update({
        where: { id: productId },
        data:  {
          average_rating: agg._avg.rating ?? 0,
          total_reviews:  agg._count.rating,
        },
      });
      return r;
    });

    return created(res, review, 'Avis ajouté');
  } catch (err) { next(err); }
}

export async function toggleFavorite(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId        = req.user!.userId;
    const { productId } = req.params;

    const existing = await prisma.favorites.findUnique({
      where: { user_id_product_id: { user_id: userId, product_id: productId } },
    });

    if (existing) {
      await prisma.favorites.delete({
        where: { user_id_product_id: { user_id: userId, product_id: productId } },
      });
      return success(res, { favorited: false }, 'Retiré des favoris');
    }

    await prisma.favorites.create({ data: { user_id: userId, product_id: productId } });
    return success(res, { favorited: true }, 'Ajouté aux favoris');
  } catch (err) { next(err); }
}