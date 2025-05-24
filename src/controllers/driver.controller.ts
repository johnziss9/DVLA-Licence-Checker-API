import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Driver } from '../models/driver.entity';
import { LicenceCheck } from '../models/licence-check.entity';

const driverRepository = AppDataSource.getRepository(Driver);
const licenceCheckRepository = AppDataSource.getRepository(LicenceCheck);

// Get all drivers for the current organisation
export const getAllDrivers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const organisationId = req.user?.organisationId;

        const drivers = await driverRepository.find({
            where: { organisationId, isActive: true },
            order: { lastName: 'ASC', firstName: 'ASC' }
        });

        res.status(200).json(drivers);
    } catch (error) {
        console.error('Error fetching drivers:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};

// Get a single driver by ID
export const getDriverById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const organisationId = req.user?.organisationId;

        const driver = await driverRepository.findOne({
            where: { id, organisationId },
            relations: ['licenceChecks']
        });

        if (!driver) {
            res.status(404).json({ message: 'Driver not found' });
            return;
        }

        res.status(200).json(driver);
    } catch (error) {
        console.error('Error fetching driver:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};

// Create a new driver
export const createDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const organisationId = req.user?.organisationId;
        const {
            firstName,
            lastName,
            drivingLicenceNumber,
            dateOfBirth,
            addressLine1,
            addressLine2,
            city,
            postcode,
            phoneNumber,
            email
        } = req.body;

        // Check if driver with same licence number already exists
        const existingDriver = await driverRepository.findOne({
            where: { drivingLicenceNumber, organisationId }
        });

        if (existingDriver) {
            res.status(400).json({ message: 'Driver with this licence number already exists' });
            return;
        }

        // Create new driver
        const newDriver = driverRepository.create({
            firstName,
            lastName,
            drivingLicenceNumber,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            addressLine1,
            addressLine2,
            city,
            postcode,
            phoneNumber,
            email,
            organisationId,
            isActive: true,
            consentProvided: false
        });

        await driverRepository.save(newDriver);

        res.status(201).json({
            message: 'Driver created successfully',
            driver: newDriver
        });
    } catch (error) {
        console.error('Error creating driver:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};

// Update a driver
export const updateDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const organisationId = req.user?.organisationId;

        const driver = await driverRepository.findOne({
            where: { id, organisationId }
        });

        if (!driver) {
            res.status(404).json({ message: 'Driver not found' });
            return;
        }

        driverRepository.merge(driver, req.body);
        const updatedDriver = await driverRepository.save(driver);

        res.status(200).json({
            message: 'Driver updated successfully',
            driver: updatedDriver
        });
    } catch (error) {
        console.error('Error updating driver:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};

// Record driver consent
export const recordConsent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const organisationId = req.user?.organisationId;

        const driver = await driverRepository.findOne({
            where: { id, organisationId }
        });

        if (!driver) {
            res.status(404).json({ message: 'Driver not found' });
            return;
        }

        const consentDate = new Date();
        const consentExpiryDate = new Date();
        consentExpiryDate.setFullYear(consentExpiryDate.getFullYear() + 3);

        driver.consentProvided = true;
        driver.consentDate = consentDate;
        driver.consentExpiryDate = consentExpiryDate;

        await driverRepository.save(driver);

        res.status(200).json({
            message: 'Driver consent recorded successfully',
            consentDate,
            consentExpiryDate
        });
    } catch (error) {
        console.error('Error recording consent:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};

// Delete (deactivate) a driver
export const deleteDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const organisationId = req.user?.organisationId;

        const driver = await driverRepository.findOne({
            where: { id, organisationId }
        });

        if (!driver) {
            res.status(404).json({ message: 'Driver not found' });
            return;
        }

        driver.isActive = false;
        await driverRepository.save(driver);

        res.status(200).json({
            message: 'Driver deactivated successfully'
        });
    } catch (error) {
        console.error('Error deleting driver:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};

// Get the latest licence check for a driver
export const getLatestLicenceCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const organisationId = req.user?.organisationId;

        const driver = await driverRepository.findOne({
            where: { id, organisationId }
        });

        if (!driver) {
            res.status(404).json({ message: 'Driver not found' });
            return;
        }

        const latestCheck = await licenceCheckRepository.findOne({
            where: { driverId: id },
            order: { checkDate: 'DESC' }
        });

        if (!latestCheck) {
            res.status(404).json({ message: 'No licence checks found for this driver' });
            return;
        }

        res.status(200).json(latestCheck);
    } catch (error) {
        console.error('Error fetching latest licence check:', error);
        res.status(500).json({ message: 'Server error' });
        next(error);
    }
};