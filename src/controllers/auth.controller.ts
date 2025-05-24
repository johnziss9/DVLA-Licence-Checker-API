import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';  // Use default import
import { AppDataSource } from '../config/database';
import { User } from '../models/user.entity';

const userRepository = AppDataSource.getRepository(User);

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await userRepository.findOne({
            where: { email, isActive: true }
        });

        if (!user) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        // Use plain javascript approach with type assertions to bypass TypeScript errors
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
            organisationId: user.organisationId
        };

        // Force cast everything to work around the type issues
        const token = jwt.sign(
            payload,
            (process.env.JWT_SECRET || 'default-jwt-secret') as jwt.Secret,
            { expiresIn: '24h' } // Hardcoded for now
        );

        res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { email, password, firstName, lastName, role, organisationId } = req.body;

        // Check if user already exists
        const existingUser = await userRepository.findOne({ where: { email } });
        if (existingUser) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        // Create new user
        const user = userRepository.create({
            email,
            password,
            firstName,
            lastName,
            role,
            organisationId
        });

        await userRepository.save(user);

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
        next(error); // Pass error to Express error handler
    }
};