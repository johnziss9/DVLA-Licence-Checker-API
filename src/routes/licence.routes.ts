import { Router } from 'express';
import licenceCheckController from '../controllers/licence-check.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../models/user.entity';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Perform a new licence check
router.post('/', licenceCheckController.performCheck.bind(licenceCheckController));

// Get drivers due for licence checks
router.get('/due', licenceCheckController.getDriversDue.bind(licenceCheckController));

// Get licence check statistics for dashboard
router.get('/stats', licenceCheckController.getStats.bind(licenceCheckController));

// Bulk licence check
router.post('/bulk', authorizeRoles(UserRole.ADMIN, UserRole.MANAGER), licenceCheckController.bulkCheck.bind(licenceCheckController));

// Test DVLA API connection (admin only)
router.get('/test-connection', authorizeRoles(UserRole.ADMIN), licenceCheckController.testConnection.bind(licenceCheckController));

// Validate licence number format
router.post('/validate-licence', licenceCheckController.validateLicence.bind(licenceCheckController));

// Get latest licence check for a specific driver
router.get('/driver/:driverId/latest', licenceCheckController.getLatestCheck.bind(licenceCheckController));

// Get licence check history for a specific driver
router.get('/driver/:driverId/history', licenceCheckController.getCheckHistory.bind(licenceCheckController));

export default router;