import { Router } from 'express';
import driverController from '../controllers/driver.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Driver CRUD routes
router.get('/', driverController.getAllDrivers.bind(driverController));
router.get('/:id', driverController.getDriverById.bind(driverController));
router.post('/', driverController.createDriver.bind(driverController));
router.put('/:id', driverController.updateDriver.bind(driverController));
router.delete('/:id', driverController.deleteDriver.bind(driverController));

// Consent management
router.post('/:id/consent', driverController.recordConsent.bind(driverController));

// Latest licence check
router.get('/:id/licence-check/latest', driverController.getLatestLicenceCheck.bind(driverController));

export default router;