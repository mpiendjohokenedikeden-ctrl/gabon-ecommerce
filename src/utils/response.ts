import { Response } from 'express';

export function success(
  res: Response,
  data: unknown,
  message = 'Succès',
  statusCode = 200
) {
  return res.status(statusCode).json({ success: true, message, data });
}

export function created(res: Response, data: unknown, message = 'Créé avec succès') {
  return success(res, data, message, 201);
}

export function paginated(
  res: Response,
  data: unknown[],
  meta: { page: number; limit: number; total: number }
) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      ...meta,
      totalPages: Math.ceil(meta.total / meta.limit),
      hasNext:    meta.page * meta.limit < meta.total,
      hasPrev:    meta.page > 1,
    },
  });
}

export function getPagination(query: { page?: string; limit?: string }) {
  const page  = Math.max(1, parseInt(query.page  || '1'));
  const limit = Math.min(100, parseInt(query.limit || '20'));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
}