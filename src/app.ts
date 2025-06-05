import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import driverRoutes from './routes/driver.routes';
import licenceRoutes from './routes/licence.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/licence-checks', licenceRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  // DVLA API specific errors
  if (err.message.includes('DVLA')) {
    res.status(502).json({ 
      error: 'DVLA service error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  } 
  // Authentication errors
  else if (err.message.includes('authentication') || err.message.includes('token')) {
    res.status(401).json({ 
      error: 'Authentication failed',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  // Not found errors
  else if (err.message.includes('not found')) {
    res.status(404).json({ 
      error: 'Resource not found',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  } 
  // Consent errors
  else if (err.message.includes('consent')) {
    res.status(400).json({ 
      error: 'Consent required',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  // Validation errors
  else if (err.message.includes('Invalid') || err.message.includes('required')) {
    res.status(400).json({ 
      error: 'Validation error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  // Default server error
  else {
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      timestamp: new Date().toISOString()
    });
  }
});

export default app;