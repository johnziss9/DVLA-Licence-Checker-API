// src/services/licence-check.service.ts
import { AppDataSource } from '../config/database';
import { LicenceCheck } from '../models/licence-check.entity';
import { Driver } from '../models/driver.entity';
import dvlaService, { DVLACheckRequest, DVLALicenceResponse } from './dvla.service';

export interface LicenceCheckResult {
    id: string;
    driverId: string;
    checkDate: Date;
    valid: boolean;
    status: string;
    statusCode: string;
    licenceType: string;
    categories: any[];
    penaltyPoints: number;
    endorsements: any[];
    disqualifications: any[];
    restrictions: any[];
    expiryDate: Date | null;
    issueDate: Date | null;
    riskLevel: 'low' | 'medium' | 'high';
    cpcDetails?: any;
    tachographDetails?: any;
    rawResponse: any;
}

export interface RiskAssessment {
    level: 'low' | 'medium' | 'high';
    score: number;
    factors: string[];
    recommendations: string[];
}

export class LicenceCheckService {
    private licenceCheckRepository = AppDataSource.getRepository(LicenceCheck);
    private driverRepository = AppDataSource.getRepository(Driver);

    /**
     * Perform a new licence check for a driver
     */
    async performLicenceCheck(
        driverId: string,
        checkedBy: string,
        organisationId: string,
        includeCPC: boolean = false,
        includeTacho: boolean = false
    ): Promise<LicenceCheckResult> {
        // Get driver details
        const driver = await this.driverRepository.findOne({
            where: { id: driverId, organisationId },
        });

        if (!driver) {
            throw new Error('Driver not found');
        }

        if (!driver.licenceNumber) {
            throw new Error('Driver licence number is required');
        }

        // Prepare DVLA request
        const dvlaRequest: DVLACheckRequest = {
            drivingLicenceNumber: driver.licenceNumber,
            includeCPC,
            includeTacho,
            acceptPartialResponse: "false",
        };

        try {
            // Call DVLA API
            const dvlaResponse = await dvlaService.checkLicence(dvlaRequest);

            // Determine if licence is valid based on status and expiry
            const isValid = this.isLicenceValid(dvlaResponse);

            // Calculate risk assessment
            const riskAssessment = this.calculateRiskLevel(dvlaResponse);

            // Create licence check record
            const licenceCheck = new LicenceCheck();
            licenceCheck.driverId = driverId;
            licenceCheck.checkedBy = checkedBy;
            licenceCheck.organisationId = organisationId;
            licenceCheck.checkDate = new Date();
            licenceCheck.valid = isValid;

            // Handle different possible response formats
            licenceCheck.status = dvlaResponse.licence?.status || dvlaResponse.status || 'unknown';
            licenceCheck.statusCode = dvlaResponse.licence?.status || dvlaResponse.statusCode || 'unknown';
            licenceCheck.licenceType = dvlaResponse.licence?.type || dvlaResponse.licenceType || 'unknown';

            // Handle categories/entitlements
            if (dvlaResponse.categories && Array.isArray(dvlaResponse.categories)) {
                licenceCheck.categories = dvlaResponse.categories;
            } else if (dvlaResponse.entitlement && Array.isArray(dvlaResponse.entitlement)) {
                licenceCheck.categories = dvlaResponse.entitlement;
            } else {
                licenceCheck.categories = [];
            }

            licenceCheck.penaltyPoints = dvlaResponse.penaltyPoints || 0;
            licenceCheck.endorsements = dvlaResponse.endorsements || [];
            licenceCheck.disqualifications = dvlaResponse.disqualifications || [];
            licenceCheck.restrictions = dvlaResponse.restrictions || [];

            // Handle dates - DVLA might have different date field names
            licenceCheck.expiryDate = null;
            licenceCheck.issueDate = null;

            if (dvlaResponse.licenceDetails?.expiryDate) {
                try {
                    licenceCheck.expiryDate = new Date(dvlaResponse.licenceDetails.expiryDate);
                } catch (error) {
                    console.warn('Invalid expiry date:', dvlaResponse.licenceDetails.expiryDate);
                }
            }

            if (dvlaResponse.licenceDetails?.issueDate) {
                try {
                    licenceCheck.issueDate = new Date(dvlaResponse.licenceDetails.issueDate);
                } catch (error) {
                    console.warn('Invalid issue date:', dvlaResponse.licenceDetails.issueDate);
                }
            }

            licenceCheck.riskLevel = riskAssessment.level;
            licenceCheck.riskScore = riskAssessment.score;
            licenceCheck.riskFactors = riskAssessment.factors;
            licenceCheck.cpcDetails = dvlaResponse.cpcDetails || null;
            licenceCheck.tachographDetails = dvlaResponse.tachographDetails || null;
            licenceCheck.rawResponse = dvlaResponse;

            // Calculate next check date based on risk level
            licenceCheck.nextCheckDue = this.calculateNextCheckDate(riskAssessment.level);

            // Save to database
            const savedCheck = await this.licenceCheckRepository.save(licenceCheck);

            // Update driver's information
            await this.updateDriverFromLicenceCheck(driver, dvlaResponse, riskAssessment);

            return this.mapToResult(savedCheck);
        } catch (error) {
            // Log failed check attempt
            const failedCheck = new LicenceCheck();
            failedCheck.driverId = driverId;
            failedCheck.checkedBy = checkedBy;
            failedCheck.organisationId = organisationId;
            failedCheck.checkDate = new Date();
            failedCheck.valid = false;
            failedCheck.errorMessage = error instanceof Error ? error.message : 'Unknown error';
            failedCheck.riskLevel = 'high'; // Assume high risk if we can't check

            await this.licenceCheckRepository.save(failedCheck);

            throw error;
        }
    }

    /**
     * Get the latest licence check for a driver
     */
    async getLatestCheck(driverId: string, organisationId: string): Promise<LicenceCheckResult | null> {
        const latestCheck = await this.licenceCheckRepository.findOne({
            where: { driverId, organisationId },
            order: { checkDate: 'DESC' },
        });

        return latestCheck ? this.mapToResult(latestCheck) : null;
    }

    /**
     * Get licence check history for a driver
     */
    async getCheckHistory(
        driverId: string,
        organisationId: string,
        limit: number = 10
    ): Promise<LicenceCheckResult[]> {
        const checks = await this.licenceCheckRepository.find({
            where: { driverId, organisationId },
            order: { checkDate: 'DESC' },
            take: limit,
        });

        return checks.map(check => this.mapToResult(check));
    }

    /**
     * Get all drivers due for licence checks
     */
    async getDriversDueForCheck(organisationId: string): Promise<any[]> {
        const query = `
      SELECT DISTINCT d.id, d.first_name as "firstName", d.last_name as "lastName", 
             d.licence_number as "licenceNumber", d.last_licence_check as "lastLicenceCheck",
             lc.next_check_due as "nextCheckDue", lc.risk_level as "riskLevel", 
             lc.check_date as "lastCheckDate"
      FROM drivers d
      LEFT JOIN (
        SELECT DISTINCT ON (driver_id) driver_id, next_check_due, risk_level, check_date
        FROM licence_checks 
        WHERE organisation_id = $1
        ORDER BY driver_id, check_date DESC
      ) lc ON d.id = lc.driver_id
      WHERE d.organisation_id = $1 
        AND d.active = true 
        AND d.consent_provided = true
        AND (lc.next_check_due IS NULL OR lc.next_check_due <= NOW())
    `;

        return AppDataSource.query(query, [organisationId]);
    }

    /**
     * Determine if licence is valid based on DVLA response
     */
    private isLicenceValid(dvlaResponse: DVLALicenceResponse): boolean {
        // Check if licence is not expired
        if (dvlaResponse.licenceDetails?.expiryDate) {
            try {
                const expiryDate = new Date(dvlaResponse.licenceDetails.expiryDate);
                const now = new Date();

                if (expiryDate < now) {
                    return false;
                }
            } catch (error) {
                console.warn('Invalid expiry date format:', dvlaResponse.licenceDetails.expiryDate);
                return false;
            }
        }

        // Check status codes that indicate invalid licence
        const invalidStatusCodes = ['REVOKED', 'SURRENDERED', 'REFUSED', 'DISQUALIFIED'];
        if (invalidStatusCodes.includes(dvlaResponse.statusCode)) {
            return false;
        }

        // Check for active disqualifications
        if (dvlaResponse.disqualifications && dvlaResponse.disqualifications.length > 0) {
            const activeDisqualifications = dvlaResponse.disqualifications.filter((disq: any) => {
                if (!disq.endDate) return true; // No end date means still active
                try {
                    const endDate = new Date(disq.endDate);
                    return endDate > new Date();
                } catch (error) {
                    console.warn('Invalid disqualification end date:', disq.endDate);
                    return true; // Assume active if date is invalid
                }
            });

            if (activeDisqualifications.length > 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Update driver information from licence check
     */
    private async updateDriverFromLicenceCheck(
        driver: Driver,
        dvlaResponse: DVLALicenceResponse,
        riskAssessment: RiskAssessment
    ): Promise<void> {
        const updateData: Partial<Driver> = {
            lastLicenceCheck: new Date(),
            licenceStatus: this.isLicenceValid(dvlaResponse) ? 'valid' : 'invalid',
            riskLevel: riskAssessment.level,
            penaltyPoints: dvlaResponse.penaltyPoints || 0,
        };

        // Handle different possible category formats from DVLA
        if (dvlaResponse.categories && Array.isArray(dvlaResponse.categories)) {
            updateData.licenceCategories = dvlaResponse.categories.map((cat: any) => cat.code || cat.categoryCode);
        } else if (dvlaResponse.entitlement && Array.isArray(dvlaResponse.entitlement)) {
            // DVLA uses 'entitlement' instead of 'categories'
            updateData.licenceCategories = dvlaResponse.entitlement.map((ent: any) => ent.categoryCode);
        } else {
            updateData.licenceCategories = [];
        }

        // Update CPC expiry if available
        if (dvlaResponse.cpcDetails?.expiryDate) {
            try {
                updateData.cpcExpiryDate = new Date(dvlaResponse.cpcDetails.expiryDate);
            } catch (error) {
                console.warn('Invalid CPC expiry date:', dvlaResponse.cpcDetails.expiryDate);
            }
        }

        await this.driverRepository.update(driver.id, updateData);
    }

    /**
     * Calculate risk level based on DVLA response
     */
    private calculateRiskLevel(dvlaResponse: DVLALicenceResponse): RiskAssessment {
        let score = 0;
        const factors: string[] = [];
        const recommendations: string[] = [];

        // Base score for invalid licence
        if (!this.isLicenceValid(dvlaResponse)) {
            score += 50;
            factors.push('Invalid or expired licence');
            recommendations.push('Immediate investigation required');
        }

        // Penalty points scoring
        const points = dvlaResponse.penaltyPoints || 0;
        if (points >= 9) {
            score += 30;
            factors.push(`High penalty points (${points})`);
            recommendations.push('Consider additional training');
        } else if (points >= 6) {
            score += 15;
            factors.push(`Medium penalty points (${points})`);
            recommendations.push('Monitor closely');
        } else if (points >= 3) {
            score += 5;
            factors.push(`Low penalty points (${points})`);
        }

        // Recent endorsements (within last 2 years)
        const endorsements = dvlaResponse.endorsements || [];
        const recentEndorsements = endorsements.filter(endorsement => {
            try {
                const convictionDate = new Date(endorsement.dateOfConviction);
                const twoYearsAgo = new Date();
                twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
                return convictionDate > twoYearsAgo;
            } catch (error) {
                console.warn('Invalid conviction date:', endorsement.dateOfConviction);
                return false;
            }
        });

        if (recentEndorsements.length >= 3) {
            score += 25;
            factors.push(`Multiple recent endorsements (${recentEndorsements.length})`);
            recommendations.push('Pattern of offending - review required');
        } else if (recentEndorsements.length >= 2) {
            score += 15;
            factors.push(`Recent endorsements (${recentEndorsements.length})`);
        }

        // Serious offences (drink/drug driving, dangerous driving)
        const seriousOffenceCodes = ['DR10', 'DR20', 'DR30', 'DR40', 'DR50', 'DR60', 'DR70', 'DR80', 'DD40', 'DD60', 'DD80'];
        const hasSeriousOffence = endorsements.some(endorsement =>
            seriousOffenceCodes.includes(endorsement.code)
        );

        if (hasSeriousOffence) {
            score += 35;
            factors.push('Serious driving offence present');
            recommendations.push('Enhanced monitoring required');
        }

        // Active disqualifications
        if (dvlaResponse.disqualifications && dvlaResponse.disqualifications.length > 0) {
            const activeDisqualifications = dvlaResponse.disqualifications.filter((disq: any) => {
                const endDate = disq.endDate ? new Date(disq.endDate) : null;
                return !endDate || endDate > new Date();
            });

            if (activeDisqualifications.length > 0) {
                score += 40;
                factors.push('Active disqualification');
                recommendations.push('Cannot drive - immediate action required');
            }
        }

        // CPC expiry check
        if (dvlaResponse.cpcDetails) {
            const cpcExpiryDate = new Date(dvlaResponse.cpcDetails.expiryDate);
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

            if (cpcExpiryDate < now) {
                score += 20;
                factors.push('CPC expired');
                recommendations.push('CPC renewal required immediately');
            } else if (cpcExpiryDate < thirtyDaysFromNow) {
                score += 10;
                factors.push('CPC expiring soon');
                recommendations.push('Schedule CPC renewal');
            }
        }

        // Restrictions
        if (dvlaResponse.restrictions && dvlaResponse.restrictions.length > 0) {
            score += 10;
            factors.push(`Licence restrictions present (${dvlaResponse.restrictions.length})`);
            recommendations.push('Verify compliance with restrictions');
        }

        // Determine risk level
        let level: 'low' | 'medium' | 'high';
        if (score >= 40) {
            level = 'high';
        } else if (score >= 15) {
            level = 'medium';
        } else {
            level = 'low';
        }

        return { level, score, factors, recommendations };
    }

    /**
     * Calculate next check date based on risk level
     */
    private calculateNextCheckDate(riskLevel: 'low' | 'medium' | 'high'): Date {
        const nextCheck = new Date();

        switch (riskLevel) {
            case 'high':
                nextCheck.setMonth(nextCheck.getMonth() + 1); // Monthly for high risk
                break;
            case 'medium':
                nextCheck.setMonth(nextCheck.getMonth() + 3); // Quarterly for medium risk
                break;
            case 'low':
                nextCheck.setMonth(nextCheck.getMonth() + 6); // Bi-annually for low risk
                break;
        }

        return nextCheck;
    }

    /**
     * Get total drivers count
     */
    async getTotalDriversCount(organisationId: string): Promise<number> {
        return await this.driverRepository.count({
            where: { organisationId, active: true }
        });
    }

    /**
     * Get risk level statistics
     */
    async getRiskLevelStats(organisationId: string): Promise<any> {
        const query = `
      SELECT d.risk_level as "riskLevel", COUNT(*) as count
      FROM drivers d
      WHERE d.organisation_id = $1 AND d.active = true
      GROUP BY d.risk_level
    `;

        const results = await AppDataSource.query(query, [organisationId]);

        // Convert to object format
        const stats = { low: 0, medium: 0, high: 0 };
        results.forEach((result: any) => {
            stats[result.riskLevel as keyof typeof stats] = parseInt(result.count);
        });

        return stats;
    }

    /**
     * Get recent checks count
     */
    async getRecentChecksCount(organisationId: string, days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const query = `
      SELECT COUNT(*) as count
      FROM licence_checks 
      WHERE organisation_id = $1 
        AND check_date >= $2
    `;

        const result = await AppDataSource.query(query, [organisationId, cutoffDate]);
        return parseInt(result[0].count);
    }

    /**
     * Map database entity to result object
     */
    private mapToResult(licenceCheck: LicenceCheck): LicenceCheckResult {
        return {
            id: licenceCheck.id,
            driverId: licenceCheck.driverId,
            checkDate: licenceCheck.checkDate,
            valid: licenceCheck.valid,
            status: licenceCheck.status || 'unknown',
            statusCode: licenceCheck.statusCode || 'unknown',
            licenceType: licenceCheck.licenceType || 'unknown',
            categories: licenceCheck.categories || [],
            penaltyPoints: licenceCheck.penaltyPoints || 0,
            endorsements: licenceCheck.endorsements || [],
            disqualifications: licenceCheck.disqualifications || [],
            restrictions: licenceCheck.restrictions || [],
            expiryDate: licenceCheck.expiryDate,
            issueDate: licenceCheck.issueDate,
            riskLevel: licenceCheck.riskLevel,
            cpcDetails: licenceCheck.cpcDetails,
            tachographDetails: licenceCheck.tachographDetails,
            rawResponse: licenceCheck.rawResponse,
        };
    }
}

export default new LicenceCheckService();