import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Driver } from '../models/driver.entity';
import { UserRole } from '../models/user.entity';

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        organisationId: string;
        role: UserRole;
    };
}

export class DriverController {
    async getAllDrivers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const organisationId = req.user?.organisationId;
            const driverRepository = AppDataSource.getRepository(Driver);

            const drivers = await driverRepository.find({
                where: { organisationId, active: true },
                order: { createdAt: 'DESC' }
            });

            res.json({
                message: 'Drivers retrieved successfully',
                data: drivers,
                count: drivers.length
            });
        } catch (error) {
            next(error);
        }
    }

    async getDriverById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params;
            const organisationId = req.user?.organisationId;
            const driverRepository = AppDataSource.getRepository(Driver);

            const driver = await driverRepository.findOne({
                where: { id, organisationId }
            });

            if (!driver) {
                res.status(404).json({ error: 'Driver not found' });
                return;
            }

            res.json({
                message: 'Driver retrieved successfully',
                data: driver
            });
        } catch (error) {
            next(error);
        }
    }

    async createDriver(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const organisationId = req.user?.organisationId;
            const driverRepository = AppDataSource.getRepository(Driver);

            const {
                firstName,
                lastName,
                licenceNumber, // Changed from drivingLicenceNumber to licenceNumber
                dateOfBirth,
                email,
                phone,
                addressLine1,
                addressLine2,
                city,
                postcode
            } = req.body;

            // Check if licence number already exists for this organisation
            const existingDriver = await driverRepository.findOne({
                where: { licenceNumber, organisationId }
            });

            if (existingDriver) {
                res.status(400).json({ error: 'Driver with this licence number already exists' });
                return;
            }

            const newDriver = driverRepository.create({
                firstName,
                lastName,
                licenceNumber,
                dateOfBirth: new Date(dateOfBirth),
                email,
                phone,
                addressLine1,
                addressLine2,
                city,
                postcode,
                organisationId,
                active: true
            });

            const savedDriver = await driverRepository.save(newDriver);

            res.status(201).json({
                message: 'Driver created successfully',
                data: savedDriver
            });
        } catch (error) {
            next(error);
        }
    }

    async updateDriver(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params;
            const organisationId = req.user?.organisationId;
            const driverRepository = AppDataSource.getRepository(Driver);

            const driver = await driverRepository.findOne({
                where: { id, organisationId }
            });

            if (!driver) {
                res.status(404).json({ error: 'Driver not found' });
                return;
            }

            const {
                firstName,
                lastName,
                licenceNumber,
                dateOfBirth,
                email,
                phone,
                addressLine1,
                addressLine2,
                city,
                postcode
            } = req.body;

            // Update driver properties
            if (firstName) driver.firstName = firstName;
            if (lastName) driver.lastName = lastName;
            if (licenceNumber) driver.licenceNumber = licenceNumber;
            if (dateOfBirth) driver.dateOfBirth = new Date(dateOfBirth);
            if (email) driver.email = email;
            if (phone) driver.phone = phone;
            if (addressLine1) driver.addressLine1 = addressLine1;
            if (addressLine2) driver.addressLine2 = addressLine2;
            if (city) driver.city = city;
            if (postcode) driver.postcode = postcode;

            const updatedDriver = await driverRepository.save(driver);

            res.json({
                message: 'Driver updated successfully',
                data: updatedDriver
            });
        } catch (error) {
            next(error);
        }
    }

    async recordConsent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params;
            const { consentReference } = req.body;
            const organisationId = req.user?.organisationId;
            const driverRepository = AppDataSource.getRepository(Driver);

            const driver = await driverRepository.findOne({
                where: { id, organisationId }
            });

            if (!driver) {
                res.status(404).json({ error: 'Driver not found' });
                return;
            }

            const consentDate = new Date();
            const consentExpiry = new Date();
            consentExpiry.setFullYear(consentExpiry.getFullYear() + 3); // 3 years validity

            driver.consentProvided = true;
            driver.consentDate = consentDate;
            driver.consentExpiry = consentExpiry;
            if (consentReference) {
                driver.consentReference = consentReference;
            }

            const updatedDriver = await driverRepository.save(driver);

            res.json({
                message: 'Driver consent recorded successfully',
                data: {
                    id: updatedDriver.id,
                    consentProvided: updatedDriver.consentProvided,
                    consentDate: updatedDriver.consentDate,
                    consentExpiry: updatedDriver.consentExpiry,
                    consentReference: updatedDriver.consentReference
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteDriver(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params;
            const organisationId = req.user?.organisationId;
            const driverRepository = AppDataSource.getRepository(Driver);

            const driver = await driverRepository.findOne({
                where: { id, organisationId }
            });

            if (!driver) {
                res.status(404).json({ error: 'Driver not found' });
                return;
            }

            // Soft delete
            driver.active = false;
            await driverRepository.save(driver);

            res.json({
                message: 'Driver deactivated successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    async getLatestLicenceCheck(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = req.params;
            const organisationId = req.user?.organisationId;
            const driverRepository = AppDataSource.getRepository(Driver);

            const driver = await driverRepository.findOne({
                where: { id, organisationId },
                relations: ['licenceChecks'],
                order: {
                    licenceChecks: {
                        checkDate: 'DESC'
                    }
                }
            });

            if (!driver) {
                res.status(404).json({ error: 'Driver not found' });
                return;
            }

            const latestCheck = driver.licenceChecks && driver.licenceChecks.length > 0
                ? driver.licenceChecks[0]
                : null;

            res.json({
                message: 'Latest licence check retrieved successfully',
                data: {
                    driver: {
                        id: driver.id,
                        fullName: driver.fullName,
                        licenceNumber: driver.licenceNumber,
                        lastLicenceCheck: driver.lastLicenceCheck,
                        riskLevel: driver.riskLevel
                    },
                    latestCheck
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new DriverController();