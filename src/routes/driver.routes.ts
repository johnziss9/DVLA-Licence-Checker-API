import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';
import * as driverController from '../controllers/driver.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Clean, direct routing - just like your auth routes
router.get('/', driverController.getAllDrivers);
router.get('/:id', driverController.getDriverById);
router.post('/', driverController.createDriver);
router.put('/:id', driverController.updateDriver);
router.delete('/:id', driverController.deleteDriver);
router.post('/:id/consent', driverController.recordConsent);
router.get('/:id/licence-check/latest', driverController.getLatestLicenceCheck);

export default router;