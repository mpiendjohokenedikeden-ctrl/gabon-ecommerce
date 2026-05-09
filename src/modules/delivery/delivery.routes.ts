import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../../middleware/validate';
import { authenticate, isSeller, isDriver } from '../../middleware/auth.middleware';
import {
  getAvailableDrivers, assignDriver, updateDeliveryStatus,
  updateDriverLocation, getOrderTracking, registerDriver,
} from './delivery.controller';

const router = Router();

router.post('/register',         authenticate, registerDriver);
router.get('/drivers/available', authenticate, isSeller, getAvailableDrivers);
router.post('/assign',           authenticate, isSeller, [
  body('orderId').isUUID(),
  body('driverId').isUUID(),
], validate, assignDriver);
router.put('/status',            authenticate, isDriver, [
  body('orderId').isUUID(),
  body('status').notEmpty(),
], validate, updateDeliveryStatus);
router.put('/location',          authenticate, isDriver, [
  body('latitude').isFloat(),
  body('longitude').isFloat(),
], validate, updateDriverLocation);
router.get('/track/:orderId',    authenticate, getOrderTracking);

export default router;