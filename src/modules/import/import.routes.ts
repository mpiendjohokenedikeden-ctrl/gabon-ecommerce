import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isAdmin } from '../../middleware/auth.middleware';
import {
  createImportRequest, getMyImports, getImportDetail,
  acceptQuote, getImportTracking, sendQuote, addTrackingEvent,
} from './import.controller';

const router = Router();

router.post('/', authenticate, [
  body('description').optional().notEmpty(),
  body('productUrl').optional().isURL(),
], validate, createImportRequest);

router.get('/',                        authenticate, getMyImports);
router.get('/:id',                     authenticate, getImportDetail);
router.post('/:id/accept-quote',       authenticate, acceptQuote);
router.get('/:id/tracking',            authenticate, getImportTracking);

// Admin
router.post('/:id/quote',              authenticate, isAdmin, [
  body('estimatedPrice').isFloat({ min: 0 }),
  body('shippingFee').isFloat({ min: 0 }),
  body('customsFee').isFloat({ min: 0 }),
  body('estimatedDays').isInt({ min: 1 }),
], validate, sendQuote);
router.post('/:id/tracking-event',     authenticate, isAdmin, [
  body('status').notEmpty(),
  body('description').notEmpty(),
], validate, addTrackingEvent);

export default router;