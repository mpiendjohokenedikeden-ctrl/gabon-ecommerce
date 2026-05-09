import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isSeller, isAdmin } from '../../middleware/auth.middleware';
import {
  getMyWallet, getWalletHistory,
  requestWithdrawal, processWithdrawal, getWithdrawals,
} from './wallet.controller';

const router = Router();

router.get('/me',                                  authenticate, isSeller, getMyWallet);
router.get('/me/history',                          authenticate, isSeller, getWalletHistory);
router.get('/me/withdrawals',                      authenticate, isSeller, getWithdrawals);
router.post('/withdraw', authenticate, isSeller, [
  body('amount').isFloat({ min: 1 }).withMessage('Montant invalide'),
  body('method').isIn(['airtel_money', 'moov_money', 'mobicash', 'bank_transfer']),
  body('accountNumber').notEmpty().withMessage('Numéro de compte requis'),
], validate, requestWithdrawal);
router.put('/admin/withdrawals/:withdrawalId',      authenticate, isAdmin, processWithdrawal);

export default router;