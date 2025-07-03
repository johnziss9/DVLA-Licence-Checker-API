import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config();

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'dvla_licence_check',
    
    // Azure PostgreSQL requires SSL in production
    ssl: process.env.NODE_ENV === 'production' ? { 
        rejectUnauthorized: false 
    } : false,
    
    // Only sync in development
    // An example would be if a new field is added to a model, 
    // this will update the database schema accordingly and add a new column
    // It will only do that in development mode, no in production.
    synchronize: process.env.NODE_ENV === 'development',
    logging: process.env.NODE_ENV === 'development',

    entities: [path.join(__dirname, '../models/**/*.{ts,js}')],
    migrations: [path.join(__dirname, '../migrations/**/*.{ts,js}')],
    subscribers: [path.join(__dirname, '../subscribers/**/*.{ts,js}')]
});