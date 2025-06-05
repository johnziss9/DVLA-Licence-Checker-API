import { Router } from 'express';
import userController from '../controllers/user.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../models/user.entity';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get current user profile (any authenticated user)
router.get('/me', userController.getCurrentUser.bind(userController));

// Get all users (admin only)
router.get('/', authorizeRoles(UserRole.ADMIN), userController.getAllUsers.bind(userController));

// Get user by ID (admin only)
router.get('/:id', authorizeRoles(UserRole.ADMIN), userController.getUserById.bind(userController));

// Update user (admin or self)
router.put('/:id', userController.updateUser.bind(userController));

export default router;