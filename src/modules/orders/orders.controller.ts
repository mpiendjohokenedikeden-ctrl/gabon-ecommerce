import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, created, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function createOrder(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const buyerId = req.user!.userId;
    const { items, shopId, deliveryAddressId, deliveryNotes } = req.body;

    if (!items?.length) throw new AppError('Panier vide', 400);

    const productIds = items.map((i: any) => i.productId);
    const products   = await prisma.products.findMany({
      where: { id: { in: productIds }, shop_id: shopId, is_active: true },
    });

    if (products.length !== productIds.length) {
      throw new AppError('Un ou plusieurs produits sont introuvables', 400);
    }

    const shop = await prisma.shops.findUnique({ where: { id: shopId } });
    if (!shop || !shop.is_active) throw new AppError('Boutique introuvable', 404);

    let subtotal = 0;
    const orderItems = items.map((item: any) => {
      const product   = products.find((p) => p.id === item.productId)!;
      const price     = Number(product.promo_price || product.price);

      if (product.stock < item.quantity) {
        throw new AppError(`Stock insuffisant pour "${product.name}"`, 400);
      }

      const lineTotal = price * item.quantity;
      subtotal += lineTotal;

      return {
        product_id:   product.id,
        variant_id:   item.variantId || null,
        quantity:     item.quantity,
        unit_price:   price,
        total_price:  lineTotal,
        product_name: product.name,
        product_image: null,
      };
    });

    const deliveryFee       = 1000;
    const totalAmount       = subtotal + deliveryFee;
    const commissionRate    = Number(shop.commission_rate) / 100;
    const commissionAmount  = subtotal * commissionRate;
    const sellerAmount      = subtotal - commissionAmount;
    const deliveryCode      = Math.random().toString(36).substring(2, 8).toUpperCase();

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.orders.create({
        data: {
          buyer_id:            buyerId,
          shop_id:             shopId,
          status:              'pending',
          delivery_address_id: deliveryAddressId,
          delivery_notes:      deliveryNotes,
          subtotal,
          delivery_fee:        deliveryFee,
          total_amount:        totalAmount,
          commission_amount:   commissionAmount,
          seller_amount:       sellerAmount,
          delivery_code:       deliveryCode,
          order_items: { create: orderItems },
        },
        include: { order_items: true },
      });

      for (const item of items) {
        await tx.products.update({
          where: { id: item.productId },
          data:  { stock: { decrement: item.quantity } },
        });
      }

      return newOrder;
    });

    return created(res, order, 'Commande créée — procédez au paiement');
  } catch (err) { next(err); }
}

export async function getMyOrders(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const buyerId = req.user!.userId;
    const { page, limit, skip } = getPagination(req.query as any);
    const status  = req.query.status as string;

    const where: any = { buyer_id: buyerId };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.orders.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        include: {
          shops:       { select: { name: true, logo_url: true } },
          order_items: { select: { product_name: true, quantity: true, unit_price: true, product_image: true } },
        },
      }),
      prisma.orders.count({ where }),
    ]);

    return paginated(res, orders, { page, limit, total });
  } catch (err) { next(err); }
}

export async function getShopOrders(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;
    if (!shopId) throw new AppError('Boutique introuvable', 404);

    const { page, limit, skip } = getPagination(req.query as any);
    const status  = req.query.status as string;

    const where: any = { shop_id: shopId };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.orders.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        include: {
          users:       { select: { first_name: true, last_name: true, phone: true } },
          order_items: true,
        },
      }),
      prisma.orders.count({ where }),
    ]);

    return paginated(res, orders, { page, limit, total });
  } catch (err) { next(err); }
}

export async function getOrderDetail(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId        = req.user!.userId;
    const { orderId }   = req.params;

    const order = await prisma.orders.findUnique({
      where:   { id: orderId },
      include: {
        order_items:    true,
        order_tracking: { orderBy: { created_at: 'desc' } },
        shops:          { select: { name: true, logo_url: true, phone: true } },
        users:          { select: { first_name: true, last_name: true, phone: true } },
        user_addresses: true,
      },
    });

    if (!order) throw new AppError('Commande introuvable', 404);
    if (order.buyer_id !== userId && order.shop_id !== req.user!.shopId) {
      throw new AppError('Accès refusé', 403);
    }

    return success(res, order);
  } catch (err) { next(err); }
}

export async function confirmDelivery(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const buyerId     = req.user!.userId;
    const { orderId } = req.params;
    const { deliveryCode } = req.body;

    const order = await prisma.orders.findUnique({ where: { id: orderId } });
    if (!order)                    throw new AppError('Commande introuvable', 404);
    if (order.buyer_id !== buyerId) throw new AppError('Accès refusé', 403);
    if (order.status !== 'delivered') throw new AppError('Commande pas encore livrée', 400);
    if (order.delivery_code !== deliveryCode.toUpperCase()) {
      throw new AppError('Code de livraison incorrect', 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.orders.update({
        where: { id: orderId },
        data:  { status: 'completed', validated_at: new Date() },
      });

      // Libérer les fonds : pending → available
      await tx.seller_wallets.update({
        where: { shop_id: order.shop_id },
        data:  {
          balance_pending:   { decrement: order.seller_amount },
          balance_available: { increment: order.seller_amount },
        },
      });

      await tx.wallet_transactions.create({
        data: {
          shop_id:  order.shop_id,
          order_id: orderId,
          type:     'move_to_available',
          amount:   Number(order.seller_amount),
          note:     'Commande validée — fonds disponibles',
        },
      });

      await tx.shops.update({
        where: { id: order.shop_id },
        data:  { total_sales: { increment: 1 } },
      });
    });

    return success(res, null, 'Livraison confirmée ! Le vendeur a été payé.');
  } catch (err) { next(err); }
}

export async function cancelOrder(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const buyerId     = req.user!.userId;
    const { orderId } = req.params;
    const { reason }  = req.body;

    const order = await prisma.orders.findUnique({ where: { id: orderId } });
    if (!order)                    throw new AppError('Commande introuvable', 404);
    if (order.buyer_id !== buyerId) throw new AppError('Accès refusé', 403);

    if (!['pending', 'paid'].includes(order.status)) {
      throw new AppError('Cette commande ne peut plus être annulée', 400);
    }

    await prisma.orders.update({
      where: { id: orderId },
      data:  {
        status:              'cancelled',
        cancelled_at:        new Date(),
        cancellation_reason: reason,
      },
    });

    return success(res, null, 'Commande annulée');
  } catch (err) { next(err); }
}