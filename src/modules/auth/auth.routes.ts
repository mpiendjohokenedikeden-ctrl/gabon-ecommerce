import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth.middleware';
import { authLimiter } from '../../middleware/rateLimiter';
import { register, login, refreshToken, changePassword } from './auth.controller';

const router = Router();

router.post('/register',
  authLimiter,
  [
    body('email').optional().isEmail().withMessage('Email invalide'),
    body('phone').optional().isMobilePhone('any').withMessage('Téléphone invalide'),
    body('password').isLength({ min: 8 }).withMessage('Minimum 8 caractères'),
    body('role').isIn(['buyer', 'seller', 'driver']).withMessage('Rôle invalide'),
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
  ],
  validate,
  register
);

router.post('/login',
  authLimiter,
  [
    body('identifier').notEmpty().withMessage('Email ou téléphone requis'),
    body('password').notEmpty().withMessage('Mot de passe requis'),
  ],
  validate,
  login
);

router.post('/refresh', refreshToken);

router.post('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  validate,
  changePassword
);

export default router;