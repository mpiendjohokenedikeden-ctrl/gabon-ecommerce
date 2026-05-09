import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await prisma.users.findUnique({
      where:  { id: req.user!.userId },
      select: {
        id: true, email: true, phone: true, role: true,
        first_name: true, last_name: true, avatar_url: true,
        is_verified: true, phone_verified: true, email_verified: true,
        created_at: true,
        shops:          { select: { id: true, name: true, slug: true, trust_level: true } },
        user_addresses: { where: { is_default: true } },
      },
    });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    return success(res, user);
  } catch (err) { next(err); }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { firstName, lastName, avatarUrl } = req.body;

    const user = await prisma.users.update({
      where: { id: req.user!.userId },
      data:  {
        first_name: firstName,
        last_name:  lastName,
        avatar_url: avatarUrl,
        updated_at: new Date(),
      },
      select: { id: true, first_name: true, last_name: true, avatar_url: true },
    });
    return success(res, user, 'Profil mis à jour');
  } catch (err) { next(err); }
}

export async function addAddress(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { label, city, district, details, latitude, longitude, isDefault } = req.body;

    if (isDefault) {
      await prisma.user_addresses.updateMany({
        where: { user_id: req.user!.userId },
        data:  { is_default: false },
      });
    }

    const address = await prisma.user_addresses.create({
      data: {
        user_id:    req.user!.userId,
        label,
        city,
        district,
        details,
        latitude,
        longitude,
        is_default: isDefault ?? false,
      },
    });
    return success(res, address, 'Adresse ajoutée', 201);
  } catch (err) { next(err); }
}

export async function getAddresses(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const addresses = await prisma.user_addresses.findMany({
      where:   { user_id: req.user!.userId },
      orderBy: { is_default: 'desc' },
    });
    return success(res, addresses);
  } catch (err) { next(err); }
}

export async function deleteAddress(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { addressId } = req.params;
    await prisma.user_addresses.deleteMany({
      where: { id: addressId, user_id: req.user!.userId },
    });
    return success(res, null, 'Adresse supprimée');
  } catch (err) { next(err); }
}

export async function getFavorites(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const favorites = await prisma.favorites.findMany({
      where:   { user_id: req.user!.userId },
      include: {
        products: {
          select: {
            id: true, name: true, slug: true,
            price: true, promo_price: true, average_rating: true,
            product_images: { where: { is_cover: true }, take: 1 },
            shops: { select: { name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return success(res, favorites);
  } catch (err) { next(err); }
}