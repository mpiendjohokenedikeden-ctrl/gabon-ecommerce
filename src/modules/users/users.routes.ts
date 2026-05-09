import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth.middleware';
import {
  getProfile, updateProfile,
  addAddress, getAddresses, deleteAddress,
  getFavorites,
} from './users.controller';

const router = Router();

router.get('/me',                         authenticate, getProfile);
router.put('/me',                         authenticate, updateProfile);
router.get('/me/addresses',               authenticate, getAddresses);
router.post('/me/addresses',              authenticate, [
  body('city').notEmpty().withMessage('Ville requise'),
], validate, addAddress);
router.delete('/me/addresses/:addressId', authenticate, deleteAddress);
router.get('/me/favorites',               authenticate, getFavorites);

export default router;