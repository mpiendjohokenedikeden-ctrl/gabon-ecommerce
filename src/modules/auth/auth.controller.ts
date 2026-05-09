import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { success, created } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, phone, password, role, firstName, lastName } = req.body;

    if (email) {
      const exists = await prisma.users.findUnique({ where: { email } });
      if (exists) throw new AppError('Cet email est déjà utilisé', 409);
    }
    if (phone) {
      const exists = await prisma.users.findUnique({ where: { phone } });
      if (exists) throw new AppError('Ce numéro est déjà utilisé', 409);
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = await prisma.users.create({
      data: {
        email,
        phone,
        password_hash,
        role,
        first_name: firstName,
        last_name:  lastName,
      },
      select: {
        id: true, email: true, phone: true,
        role: true, first_name: true, last_name: true,
        created_at: true,
      },
    });

    const token        = generateToken({ userId: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id, role: user.role });

    return created(res, { user, token, refreshToken }, 'Compte créé avec succès');
  } catch (err) { next(err); }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { identifier, password } = req.body;

    const user = await prisma.users.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
      include: {
        shops: { select: { id: true, name: true, slug: true, trust_level: true } },
      },
    });

    if (!user)             throw new AppError('Identifiant ou mot de passe incorrect', 401);
    if (user.is_suspended) throw new AppError('Compte suspendu. Contactez le support.', 403);
    if (!user.is_active)   throw new AppError('Compte désactivé', 403);

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Identifiant ou mot de passe incorrect', 401);

    const shopId       = user.shops?.[0]?.id;
    const token        = generateToken({ userId: user.id, role: user.role, shopId });
    const refreshToken = generateRefreshToken({ userId: user.id, role: user.role, shopId });

    const { password_hash, ...userSafe } = user;
    return success(res, { user: userSafe, token, refreshToken }, 'Connexion réussie');
  } catch (err) { next(err); }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken: token } = req.body;
    if (!token) throw new AppError('Refresh token manquant', 400);

    const payload = verifyRefreshToken(token);
    if (!payload) throw new AppError('Refresh token invalide ou expiré', 401);

    const user = await prisma.users.findUnique({
      where:  { id: payload.userId },
      select: { id: true, role: true, is_active: true, is_suspended: true },
    });
    if (!user || !user.is_active || user.is_suspended) {
      throw new AppError('Compte inaccessible', 403);
    }

    const newToken = generateToken({
      userId: user.id,
      role:   user.role,
      shopId: payload.shopId,
    });
    return success(res, { token: newToken }, 'Token renouvelé');
  } catch (err) { next(err); }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('Utilisateur introuvable', 404);

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new AppError('Mot de passe actuel incorrect', 400);

    await prisma.users.update({
      where: { id: userId },
      data:  { password_hash: await bcrypt.hash(newPassword, 12) },
    });
    return success(res, null, 'Mot de passe modifié');
  } catch (err) { next(err); }
}