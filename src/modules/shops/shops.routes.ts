import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isSeller } from '../../middleware/auth.middleware';
import {
  createShop, getShop, getShopDashboard,
  updateShop, listShops,
} from './shops.controller';

const router = Router();

router.get('/',             listShops);
router.post('/', authenticate, isSeller, [
  body('name').notEmpty().withMessage('Nom requis'),
  body('city').notEmpty().withMessage('Ville requise'),
], validate, createShop);
router.get('/dashboard',    authenticate, isSeller, getShopDashboard);
router.get('/:shopId',      getShop);
router.put('/me',           authenticate, isSeller, updateShop);

export default router;