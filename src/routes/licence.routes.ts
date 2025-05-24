import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Placeholder for licence check endpoints
router.post('/check', (req, res) => {
    res.status(200).json({ message: 'This endpoint will perform a new licence check' });
});

router.get('/history', (req, res) => {
    res.status(200).json({ message: 'This endpoint will return licence check history' });
});

router.get('/expiring', (req, res) => {
    res.status(200).json({ message: 'This endpoint will return licence checks that are expiring soon' });
});

export default router;