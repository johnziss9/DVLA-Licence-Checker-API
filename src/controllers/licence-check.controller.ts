import { Request, Response, NextFunction } from 'express';
import licenceCheckService from '../services/licence-check.service';
import dvlaService from '../services/dvla.service';
import { UserRole } from '../models/user.entity';

interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        organisationId: string;
        role: UserRole;
    };
}

export class LicenceCheckController {
    /**
     * Perform a new licence check for a driver
     * POST /api/licence-checks
     */
    async performCheck(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { driverId, includeCPC = false, includeTacho = false } = req.body;
            const userId = req.user?.id!;
            const organisationId = req.user?.organisationId!;

            if (!driverId) {
                res.status(400).json({ error: 'Driver ID is required' });
                return;
            }

            const result = await licenceCheckService.performLicenceCheck(
                driverId,
                userId,
                organisationId,
                includeCPC,
                includeTacho
            );

            res.status(201).json({
                message: 'Licence check completed successfully',
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get latest licence check for a driver
     * GET /api/licence-checks/driver/:driverId/latest
     */
    async getLatestCheck(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { driverId } = req.params;
            const organisationId = req.user?.organisationId!;

            const result = await licenceCheckService.getLatestCheck(driverId, organisationId);

            if (!result) {
                res.status(404).json({ error: 'No licence checks found for this driver' });
                return;
            }

            res.json({
                message: 'Latest licence check retrieved successfully',
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get licence check history for a driver
     * GET /api/licence-checks/driver/:driverId/history
     */
    async getCheckHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { driverId } = req.params;
            const { limit } = req.query;
            const organisationId = req.user?.organisationId!;

            const results = await licenceCheckService.getCheckHistory(
                driverId,
                organisationId,
                limit ? parseInt(limit as string) : undefined
            );

            res.json({
                message: 'Licence check history retrieved successfully',
                data: results,
                count: results.length,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all drivers due for licence checks
     * GET /api/licence-checks/due
     */
    async getDriversDue(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const organisationId = req.user?.organisationId!;

            const drivers = await licenceCheckService.getDriversDueForCheck(organisationId);

            res.json({
                message: 'Drivers due for checks retrieved successfully',
                data: drivers,
                count: drivers.length,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Bulk licence check for multiple drivers
     * POST /api/licence-checks/bulk
     */
    async bulkCheck(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { driverIds, includeCPC = false, includeTacho = false } = req.body;
            const userId = req.user?.id!;
            const organisationId = req.user?.organisationId!;

            if (!Array.isArray(driverIds) || driverIds.length === 0) {
                res.status(400).json({ error: 'Driver IDs array is required' });
                return;
            }

            if (driverIds.length > 50) {
                res.status(400).json({ error: 'Maximum 50 drivers can be checked at once' });
                return;
            }

            const results = [];
            const errors = [];

            // Process checks sequentially to avoid overwhelming the DVLA API
            for (const driverId of driverIds) {
                try {
                    const result = await licenceCheckService.performLicenceCheck(
                        driverId,
                        userId,
                        organisationId,
                        includeCPC,
                        includeTacho
                    );
                    results.push(result);

                    // Add small delay between requests to be respectful to DVLA API
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    errors.push({
                        driverId,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }

            res.status(200).json({
                message: 'Bulk licence check completed',
                data: {
                    successful: results,
                    failed: errors,
                    summary: {
                        total: driverIds.length,
                        successful: results.length,
                        failed: errors.length,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Test DVLA API connection
     * GET /api/licence-checks/test-connection
     */
    async testConnection(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            // Only allow admins to test the connection
            if (req.user?.role !== UserRole.ADMIN) {
                res.status(403).json({ error: 'Admin access required' });
                return;
            }

            const isConnected = await dvlaService.testConnection();
            const tokenStatus = dvlaService.getTokenStatus();

            res.json({
                message: 'DVLA API connection test completed',
                data: {
                    connected: isConnected,
                    environment: process.env.NODE_ENV,
                    apiUrl: process.env.DVLA_API_URL,
                    tokenStatus,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Validate licence number format
     * POST /api/licence-checks/validate-licence
     */
    async validateLicence(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { licenceNumber } = req.body;

            if (!licenceNumber) {
                res.status(400).json({ error: 'Licence number is required' });
                return;
            }

            const isValid = dvlaService.validateLicenceNumber(licenceNumber);

            res.json({
                message: 'Licence number validation completed',
                data: {
                    licenceNumber,
                    valid: isValid,
                    format: 'UK driving licence format: 5 letters, 6 digits, 2 letters, 2 digits',
                    example: 'JONES061102W99AB',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get licence check statistics for dashboard
     * GET /api/licence-checks/stats
     */
    async getStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const organisationId = req.user?.organisationId!;

            // Get basic statistics
            const totalDrivers = await licenceCheckService.getTotalDriversCount(organisationId);
            const driversDue = await licenceCheckService.getDriversDueForCheck(organisationId);
            const riskStats = await licenceCheckService.getRiskLevelStats(organisationId);
            const recentChecks = await licenceCheckService.getRecentChecksCount(organisationId, 30);

            res.json({
                message: 'Licence check statistics retrieved successfully',
                data: {
                    totalDrivers,
                    driversDueForCheck: driversDue.length,
                    riskLevels: riskStats,
                    checksLastMonth: recentChecks,
                    lastUpdated: new Date().toISOString(),
                },
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new LicenceCheckController();