import { Request, Response, NextFunction, RequestHandler } from 'express';
import * as jwt from 'jsonwebtoken';
import { UserRole } from '../models/user.entity';

interface JwtPayload {
    id: string;
    email: string;
    role: UserRole;
    organisationId: string;
}

// Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

// Return type explicitly set to RequestHandler
export const authenticateToken: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.status(401).json({ message: 'Access denied. No token provided.' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
        req.user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ message: 'Invalid token' });
        return;
    }
};

// Return type explicitly set to RequestHandler
export const authorizeRoles = (...roles: UserRole[]): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        if (!roles.includes(req.user.role as UserRole)) {
            res.status(403).json({ message: 'Not authorized to access this resource' });
            return;
        }

        next();
    };
};