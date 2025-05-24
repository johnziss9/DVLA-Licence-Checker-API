import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../models/user.entity';

const router = Router();

// Create handlers separately with explicit RequestHandler typing
const getAllUsers: RequestHandler = (req: Request, res: Response) => {
    res.status(200).json({ message: 'Get all users' });
};

const getUserById: RequestHandler = (req: Request, res: Response) => {
    res.status(200).json({ message: `Get user ${req.params.id}` });
};

const updateUser: RequestHandler = (req: Request, res: Response) => {
    res.status(200).json({ message: `Update user ${req.params.id}` });
};

// Use the explicitly typed handlers
router.get('/', authenticateToken, authorizeRoles(UserRole.ADMIN), getAllUsers);
router.get('/:id', authenticateToken, getUserById);
router.put('/:id', authenticateToken, updateUser);

export default router;