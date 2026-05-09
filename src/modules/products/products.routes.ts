import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isSeller } from '../../middleware/auth.middleware';
import {
  getProducts, getProduct, createProduct,
  updateProduct, deleteProduct, addReview, toggleFavorite,
} from './products.controller';

const router = Router();

router.get('/',                            getProducts);
router.get('/:productId',                  getProduct);
router.post('/', authenticate, isSeller, [
  body('name').notEmpty().withMessage('Nom requis'),
  body('price').isFloat({ min: 0 }).withMessage('Prix invalide'),
  body('stock').isInt({ min: 0 }),
], validate, createProduct);
router.put('/:productId',                  authenticate, isSeller, updateProduct);
router.delete('/:productId',               authenticate, isSeller, deleteProduct);
router.post('/:productId/reviews',         authenticate, [
  body('orderId').isUUID(),
  body('rating').isInt({ min: 1, max: 5 }),
], validate, addReview);
router.post('/:productId/favorite',        authenticate, toggleFavorite);

export default router;