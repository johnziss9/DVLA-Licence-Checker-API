import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import driverRoutes from './routes/driver.routes';
import licenceRoutes from './routes/licence.routes';

// Load environment variables
config();

const app: Application = express();

// Middleware
app.use(helmet()); // Add security headers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Parse request body

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/licences', licenceRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', message: 'API is running' });
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ message: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal server error' });
});

export default app;