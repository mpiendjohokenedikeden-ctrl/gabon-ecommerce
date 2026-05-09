import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getAvailableDrivers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId = req.user!.shopId;

    const drivers = await prisma.drivers.findMany({
      where: {
        is_available: true,
        is_verified:  true,
        OR: [
          { shop_id: shopId },
          { is_independent: true },
        ],
      },
      include: {
        users: { select: { first_name: true, last_name: true, phone: true, avatar_url: true } },
      },
    });

    return success(res, drivers);
  } catch (err) { next(err); }
}

export async function assignDriver(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const shopId          = req.user!.shopId;
    const { orderId, driverId } = req.body;

    const order = await prisma.orders.findUnique({ where: { id: orderId } });
    if (!order)                   throw new AppError('Commande introuvable', 404);
    if (order.shop_id !== shopId)  throw new AppError('Accès refusé', 403);
    if (order.status !== 'paid')   throw new AppError('La commande doit être payée', 400);

    const driver = await prisma.drivers.findUnique({ where: { id: driverId } });
    if (!driver || !driver.is_available) throw new AppError('Livreur non disponible', 400);

    await prisma.$transaction(async (tx) => {
      await tx.orders.update({
        where: { id: orderId },
        data:  { status: 'processing' },
      });

      await tx.order_tracking.create({
        data: {
          order_id:  orderId,
          driver_id: driverId,
          status:    'driver_assigned',
          note:      'Livreur assigné à la commande',
        },
      });

      // Marquer le livreur comme occupé
      await tx.drivers.update({
        where: { id: driverId },
        data:  { is_available: false },
      });
    });

    return success(res, null, 'Livreur assigné');
  } catch (err) { next(err); }
}

export async function updateDeliveryStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const driverId        = req.user!.userId;
    const { orderId, status, note, latitude, longitude } = req.body;

    const driver = await prisma.drivers.findFirst({ where: { user_id: driverId } });
    if (!driver) throw new AppError('Livreur introuvable', 404);

    const validStatuses = ['picked_up', 'on_the_way', 'arrived', 'delivered'];
    if (!validStatuses.includes(status)) throw new AppError('Statut invalide', 400);

    await prisma.$transaction(async (tx) => {
      await tx.order_tracking.create({
        data: {
          order_id:  orderId,
          driver_id: driver.id,
          status,
          note,
          latitude,
          longitude,
        },
      });

      if (status === 'delivered') {
        await tx.orders.update({
          where: { id: orderId },
          data:  { status: 'delivered', delivered_at: new Date() },
        });
        // Remettre le livreur disponible
        await tx.drivers.update({
          where: { id: driver.id },
          data:  { is_available: true, total_deliveries: { increment: 1 } },
        });
      }

      if (status === 'on_the_way') {
        await tx.orders.update({
          where: { id: orderId },
          data:  { status: 'shipped' },
        });
      }
    });

    return success(res, null, 'Statut mis à jour');
  } catch (err) { next(err); }
}

export async function updateDriverLocation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId              = req.user!.userId;
    const { latitude, longitude } = req.body;

    await prisma.drivers.updateMany({
      where: { user_id: userId },
      data:  {
        current_lat:  latitude,
        current_lng:  longitude,
        last_seen_at: new Date(),
      },
    });

    return success(res, null, 'Position mise à jour');
  } catch (err) { next(err); }
}

export async function getOrderTracking(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { orderId } = req.params;

    const tracking = await prisma.order_tracking.findMany({
      where:   { order_id: orderId },
      orderBy: { created_at: 'asc' },
      include: {
        drivers: {
          include: {
            users: { select: { first_name: true, last_name: true, phone: true } },
          },
        },
      },
    });

    return success(res, tracking);
  } catch (err) { next(err); }
}

export async function registerDriver(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { shopId, isIndependent, vehicleType, licensePlate } = req.body;

    const existing = await prisma.drivers.findFirst({ where: { user_id: userId } });
    if (existing) throw new AppError('Profil livreur déjà créé', 409);

    const driver = await prisma.drivers.create({
      data: {
        user_id:        userId,
        shop_id:        isIndependent ? null : shopId,
        is_independent: isIndependent ?? false,
        vehicle_type:   vehicleType,
        license_plate:  licensePlate,
      },
    });

    return success(res, driver, 'Profil livreur créé', 201);
  } catch (err) { next(err); }
}