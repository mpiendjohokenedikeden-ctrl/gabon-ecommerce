import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isSeller } from '../../middleware/auth.middleware';
import {
  createOrder, getMyOrders, getShopOrders,
  getOrderDetail, confirmDelivery, cancelOrder,
} from './orders.controller';

const router = Router();

router.post('/', authenticate, [
  body('shopId').isUUID().withMessage('shopId invalide'),
  body('items').isArray({ min: 1 }).withMessage('Panier vide'),
  body('items.*.productId').isUUID(),
  body('items.*.quantity').isInt({ min: 1 }),
], validate, createOrder);

router.get('/my',              authenticate, getMyOrders);
router.get('/shop',            authenticate, isSeller, getShopOrders);
router.get('/:orderId',        authenticate, getOrderDetail);
router.post('/:orderId/confirm', authenticate, [
  body('deliveryCode').notEmpty().withMessage('Code requis'),
], validate, confirmDelivery);
router.post('/:orderId/cancel',  authenticate, cancelOrder);

export default router;