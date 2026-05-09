import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { success, created, paginated, getPagination } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function createImportRequest(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const { description, imageUrl, productUrl, sourceCountry } = req.body;

    if (!description && !imageUrl && !productUrl) {
      throw new AppError('Fournissez une description, une image ou un lien produit', 400);
    }

    const importRequest = await prisma.import_requests.create({
      data: {
        requester_id:   requesterId,
        description,
        image_url:      imageUrl ?? null,
        product_url:    productUrl ?? null,
        source_country: sourceCountry ?? 'Chine',
        status:         'pending',
      },
    });

    return created(res, importRequest, 'Demande soumise — notre équipe vous contactera sous 24h');
  } catch (err) { next(err); }
}

export async function getMyImports(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const requesterId = req.user!.userId;
    const { page, limit, skip } = getPagination(req.query as any);

    const [imports, total] = await Promise.all([
      prisma.import_requests.findMany({
        where:   { requester_id: requesterId },
        orderBy: { created_at: 'desc' },
        skip,
        take:    limit,
        include: {
          import_tracking_events: {
            orderBy: { created_at: 'desc' },
            take:    1,
          },
        },
      }),
      prisma.import_requests.count({ where: { requester_id: requesterId } }),
    ]);

    return paginated(res, imports, { page, limit, total });
  } catch (err) { next(err); }
}

export async function getImportDetail(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId   = req.user!.userId;
    const { id }   = req.params;

    const importReq = await prisma.import_requests.findUnique({
      where:   { id },
      include: {
        import_tracking_events: { orderBy: { created_at: 'asc' } },
        payments:               { select: { id: true, status: true, amount: true, method: true } },
      },
    });

    if (!importReq) throw new AppError('Demande introuvable', 404);
    if (importReq.requester_id !== userId && req.user!.role !== 'admin') {
      throw new AppError('Accès refusé', 403);
    }

    return success(res, importReq);
  } catch (err) { next(err); }
}

export async function acceptQuote(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const importReq = await prisma.import_requests.findUnique({ where: { id } });
    if (!importReq)                      throw new AppError('Demande introuvable', 404);
    if (importReq.requester_id !== userId) throw new AppError('Accès refusé', 403);
    if (importReq.status !== 'quoted')    throw new AppError('Aucun devis à accepter', 400);

    if (importReq.quote_expires_at && new Date() > importReq.quote_expires_at) {
      throw new AppError('Le devis a expiré. Contactez le support.', 400);
    }

    await prisma.import_requests.update({
      where: { id },
      data:  { status: 'accepted', updated_at: new Date() },
    });

    return success(res, null, 'Devis accepté — procédez au paiement');
  } catch (err) { next(err); }
}

export async function getImportTracking(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const importReq = await prisma.import_requests.findUnique({
      where:   { id },
      select:  {
        id: true, status: true, tracking_number: true,
        tracking_carrier: true, estimated_days: true,
        requester_id: true,
        import_tracking_events: { orderBy: { created_at: 'asc' } },
      },
    });

    if (!importReq) throw new AppError('Demande introuvable', 404);
    if (importReq.requester_id !== userId && req.user!.role !== 'admin') {
      throw new AppError('Accès refusé', 403);
    }

    // Étapes de progression
    const steps = [
      'pending', 'analyzing', 'quoted', 'accepted', 'paid',
      'purchasing', 'exporting', 'in_transit',
      'arrived_gabon', 'customs', 'delivering', 'completed',
    ];
    const currentStep = steps.indexOf(importReq.status);

    return success(res, {
      ...importReq,
      progressPercent: Math.round((currentStep / (steps.length - 1)) * 100),
      steps: steps.map((s, i) => ({
        key:       s,
        completed: i <= currentStep,
        current:   i === currentStep,
      })),
    });
  } catch (err) { next(err); }
}

// ADMIN — envoyer un devis
export async function sendQuote(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const adminId  = req.user!.userId;
    const { id }   = req.params;
    const {
      estimatedPrice, shippingFee, customsFee,
      estimatedDays, quoteNote,
    } = req.body;

    const totalQuote = estimatedPrice + shippingFee + customsFee;
    const expiresAt  = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3); // valide 3 jours

    const importReq = await prisma.import_requests.update({
      where: { id },
      data:  {
        status:           'quoted',
        estimated_price:  estimatedPrice,
        shipping_fee:     shippingFee,
        customs_fee:      customsFee,
        total_quote:      totalQuote,
        estimated_days:   estimatedDays,
        quote_note:       quoteNote,
        quote_expires_at: expiresAt,
        handled_by:       adminId,
        updated_at:       new Date(),
      },
    });

    return success(res, importReq, 'Devis envoyé au client');
  } catch (err) { next(err); }
}

// ADMIN — ajouter un événement de suivi
export async function addTrackingEvent(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id }                         = req.params;
    const { status, description, location } = req.body;

    await prisma.$transaction(async (tx) => {
      await tx.import_tracking_events.create({
        data: { import_id: id, status, description, location },
      });

      await tx.import_requests.update({
        where: { id },
        data:  { status, updated_at: new Date() },
      });
    });

    return success(res, null, 'Événement de suivi ajouté');
  } catch (err) { next(err); }
}