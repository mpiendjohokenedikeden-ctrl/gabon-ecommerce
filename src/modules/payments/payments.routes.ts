import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth.middleware';
import {
  initiatePayment, confirmPayment,
  webhookMobileMoney, getPaymentHistory,
} from './payments.controller';

const router = Router();

router.post('/initiate', authenticate, [
  body('orderId').isUUID().withMessage('orderId invalide'),
  body('method').isIn([
    'airtel_money', 'moov_money', 'mobicash',
    'bank_transfer', 'visa',
  ]).withMessage('Méthode de paiement invalide'),
], validate, initiatePayment);

router.post('/:paymentId/confirm', authenticate, confirmPayment);

// Webhooks opérateurs (pas d'auth — IP whitelist à configurer)
router.post('/webhook/mobile-money', webhookMobileMoney);

router.get('/history', authenticate, getPaymentHistory);

export default router;