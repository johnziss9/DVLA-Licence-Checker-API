import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { User } from '../models/user.entity';
import { UserRole } from '../models/user.entity';

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        organisationId: string;
        role: UserRole;
    };
}

export class UserController {
    /**
     * Get all users (Admin only)
     * GET /api/users
     */
    async getAllUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const organisationId = req.user?.organisationId;
            const userRepository = AppDataSource.getRepository(User);

            const users = await userRepository.find({
                where: { organisationId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                    // Exclude password from response
                },
                order: { createdAt: 'DESC' }
            });

            res.json({
                message: 'Users retrieved successfully',
                data: users,
                count: users.length
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get user by ID
     * GET /api/users/:id
     */
    async getUserById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params;
            const organisationId = req.user?.organisationId;
            const userRepository = AppDataSource.getRepository(User);

            const user = await userRepository.findOne({
                where: { id, organisationId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                    // Exclude password from response
                }
            });

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.json({
                message: 'User retrieved successfully',
                data: user
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Update user
     * PUT /api/users/:id
     */
    async updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params;
            const organisationId = req.user?.organisationId;
            const currentUserId = req.user?.id;
            const currentUserRole = req.user?.role;
            const userRepository = AppDataSource.getRepository(User);

            const user = await userRepository.findOne({
                where: { id, organisationId }
            });

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Check permissions - users can only update themselves unless they're admin
            if (id !== currentUserId && currentUserRole !== UserRole.ADMIN) {
                res.status(403).json({ error: 'You can only update your own profile unless you are an admin' });
                return;
            }

            const {
                firstName,
                lastName,
                email,
                role
            } = req.body;

            // Update allowed fields
            if (firstName !== undefined) user.firstName = firstName;
            if (lastName !== undefined) user.lastName = lastName;
            if (email !== undefined) {
                // Check if email is already taken by another user
                const existingUser = await userRepository.findOne({
                    where: { email, organisationId }
                });

                if (existingUser && existingUser.id !== id) {
                    res.status(400).json({ error: 'Email already in use by another user' });
                    return;
                }
                user.email = email;
            }

            // Only admins can update roles
            if (role !== undefined) {
                if (currentUserRole !== UserRole.ADMIN) {
                    res.status(403).json({ error: 'Only admins can update user roles' });
                    return;
                }
                user.role = role;
            }

            const updatedUser = await userRepository.save(user);

            // Return user without password
            const { password, ...userWithoutPassword } = updatedUser;

            res.json({
                message: 'User updated successfully',
                data: userWithoutPassword
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get current user profile
     * GET /api/users/me
     */
    async getCurrentUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            const organisationId = req.user?.organisationId;
            const userRepository = AppDataSource.getRepository(User);

            const user = await userRepository.findOne({
                where: { id: userId, organisationId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                }
            });

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.json({
                message: 'Current user retrieved successfully',
                data: user
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new UserController();