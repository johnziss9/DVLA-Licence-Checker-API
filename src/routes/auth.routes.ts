import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

// Use the controller functions directly as route handlers
router.post('/login', authController.login);
router.post('/register', authController.register);

export default router;