if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
    require('applicationinsights').setup().start();
}

import 'reflect-metadata';
import app from './app';
import { AppDataSource } from './config/database';

const PORT = process.env.PORT || 3000;

// Initialize database connection
AppDataSource.initialize()
    .then(() => {
        console.log('Connected to PostgreSQL');

        // Start the server
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Database connection error:', error);
        process.exit(1);
    });