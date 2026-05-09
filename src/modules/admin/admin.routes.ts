import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isAdmin } from '../../middleware/auth.middleware';
import {
  getDashboard, getAllUsers, suspendUser, reactivateUser,
  getAllOrders, getAllWithdrawals, getAllDisputes,
  verifyShop, getSettings, updateSetting,
} from './admin.controller';

const router = Router();

router.get('/dashboard',               authenticate, isAdmin, getDashboard);

router.get('/users',                   authenticate, isAdmin, getAllUsers);
router.put('/users/:userId/suspend',   authenticate, isAdmin, [
  body('reason').notEmpty(),
], validate, suspendUser);
router.put('/users/:userId/reactivate', authenticate, isAdmin, reactivateUser);

router.get('/orders',                  authenticate, isAdmin, getAllOrders);

router.get('/withdrawals',             authenticate, isAdmin, getAllWithdrawals);

router.get('/disputes',                authenticate, isAdmin, getAllDisputes);

router.put('/shops/:shopId/verify',    authenticate, isAdmin, [
  body('trustLevel').isIn(['gray', 'blue', 'purple', 'gold']),
], validate, verifyShop);

router.get('/settings',                authenticate, isAdmin, getSettings);
router.put('/settings/:key',           authenticate, isAdmin, [
  body('value').notEmpty(),
], validate, updateSetting);

export default router;