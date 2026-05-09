import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isAdmin } from '../../middleware/auth.middleware';
import {
  openDispute, getMyDisputes, addEvidence,
  getDisputeDetail, resolveDispute,
} from './disputes.controller';

const router = Router();

router.post('/', authenticate, [
  body('orderId').isUUID().withMessage('orderId invalide'),
  body('reason').notEmpty().withMessage('Raison requise'),
], validate, openDispute);

router.get('/',                              authenticate, getMyDisputes);
router.get('/:disputeId',                    authenticate, getDisputeDetail);
router.post('/:disputeId/evidence',          authenticate, [
  body('fileUrl').isURL().withMessage('URL invalide'),
], validate, addEvidence);
router.put('/:disputeId/resolve',            authenticate, isAdmin, [
  body('resolution').notEmpty(),
  body('favorBuyer').isBoolean(),
], validate, resolveDispute);

export default router;