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
            const riskAssessment = this.calculateRiskLevel(dvlaResponse, driver);

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
    private calculateRiskLevel(dvlaResponse: DVLALicenceResponse, driver?: Driver): RiskAssessment {
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

        const endorsements = dvlaResponse.endorsements || [];
        const now = new Date();
        const sixMonthsAgo = new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
        const twelveMonthsAgo = new Date(now.getTime() - (12 * 30 * 24 * 60 * 60 * 1000));
        const twoYearsAgo = new Date(now.getTime() - (24 * 30 * 24 * 60 * 60 * 1000));

        let timeWeightedScore = 0; // Total points from time-weighted endorsements
        let veryRecentCount = 0; // Count of endorsements in last 6 months
        let recentCount = 0; // Count of endorsements 6-12 months ago
        let moderateCount = 0; // Count of endorsements 12-24 months ago

        endorsements.forEach(endorsement => {
            try {
                const convictionDate = new Date(endorsement.dateOfConviction);

                if (convictionDate > sixMonthsAgo) {
                    timeWeightedScore += 15;
                    veryRecentCount++;
                } else if (convictionDate > twelveMonthsAgo) {
                    timeWeightedScore += 10;
                    recentCount++;
                } else if (convictionDate > twoYearsAgo) {
                    timeWeightedScore += 5;
                    moderateCount++;
                }
                // Anything more than 2 years gets no points
            } catch (error) {
                console.warn('Invalid conviction date:', endorsement.dateOfConviction);
            }
        });

        score += timeWeightedScore;

        const timePeriods = [];
        if (veryRecentCount > 0) {
            timePeriods.push(`${veryRecentCount} in last 6 months`);
        }
        if (recentCount > 0) {
            timePeriods.push(`${recentCount} in 6-12 months`);
        }
        if (moderateCount > 0) {
            timePeriods.push(`${moderateCount} in 12-24 months`);
        }

        if (timePeriods.length > 0) {
            factors.push(`Time-weighted endorsements: ${timePeriods.join(', ')}`);

            if (veryRecentCount >= 2) {
                recommendations.push('Multiple very recent offences - immediate review required');
            } else if (veryRecentCount >= 1 && (recentCount + moderateCount) >= 2) {
                recommendations.push('Escalating pattern detected - enhanced monitoring recommended');
            } else if (timeWeightedScore >= 20) {
                recommendations.push('Recent offending pattern - closer monitoring advised');
            }
        }

        const seriousOffenceCodes = [
            // Drink/Drug driving
            'DR10', 'DR20', 'DR30', 'DR40', 'DR50', 'DR60', 'DR70', 'DR80',

            // Dangerous driving
            'DD40', 'DD60', 'DD80',

            // Insurance offences
            'IN10', 'IN20', 'IN30',

            // Construction & Use violations
            'LC20', 'LC30', 'LC40', 'LC50',

            // Taking vehicle without consent
            'UT50',

            // Death by careless driving
            'CD40', 'CD50', 'CD60',

            // Failure to provide information
            'MS50', 'MS60', 'MS70'
        ];

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

        // Age-based Risk Factors
        if (driver && driver.dateOfBirth) {
            try {
                const birthDate = new Date(driver.dateOfBirth);
                const now = new Date();
                const age = Math.floor((now.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

                // Check if medical review is required based on age
                let medicalRequired = false;
                let medicalFrequency = '';

                if (age >= 65) {
                    medicalRequired = true;
                    medicalFrequency = 'annually';
                } else if (age >= 45) {
                    medicalRequired = true;
                    medicalFrequency = 'every 5 years';
                }

                if (medicalRequired && driver.lastMedicalDate) {
                    const lastMedical = new Date(driver.lastMedicalDate);
                    const daysSinceLastMedical = Math.floor((now.getTime() - lastMedical.getTime()) / (24 * 60 * 60 * 1000));

                    let maxDaysBetweenMedicals = age >= 65 ? 365 : (5 * 365); // 1 year or 5 years
                    let warningDays = age >= 65 ? 30 : 90; // Warning period

                    if (daysSinceLastMedical > maxDaysBetweenMedicals) {
                        score += 25;
                        factors.push(`Medical review overdue (${Math.floor(daysSinceLastMedical / 365)} years overdue)`);
                        recommendations.push(`Medical review required immediately - driver aged ${age} needs ${medicalFrequency} medicals`);
                    } else if (daysSinceLastMedical > (maxDaysBetweenMedicals - warningDays)) {
                        score += 10;
                        factors.push(`Medical review due soon (${Math.floor((maxDaysBetweenMedicals - daysSinceLastMedical) / 30)} months remaining)`);
                        recommendations.push(`Schedule medical review - due ${medicalFrequency} for age ${age}`);
                    }
                } else if (medicalRequired && !driver.lastMedicalDate) {
                    // No medical date on record for driver who needs one
                    score += 20;
                    factors.push(`No medical review date on record (age ${age})`);
                    recommendations.push(`Medical review status unknown - driver aged ${age} requires ${medicalFrequency} medicals`);
                }

                // New driver special rules (passed test less than 2 years ago)
                if (driver.licenceIssueDate) {
                    const licenceIssue = new Date(driver.licenceIssueDate);
                    const daysSinceLicence = Math.floor((now.getTime() - licenceIssue.getTime()) / (24 * 60 * 60 * 1000));

                    if (daysSinceLicence < (2 * 365)) {
                        // New driver - lower point threshold
                        const points = dvlaResponse.penaltyPoints || 0;
                        if (points >= 6) {
                            score += 15;
                            factors.push(`New driver approaching 6-point threshold (${points} points)`);
                            recommendations.push('New driver at risk - 6 points triggers licence revocation');
                        }
                    }
                }

            } catch (error) {
                console.warn('Error calculating age-based risk factors:', error);
            }
        }

        // Professional driver category detection
        // This checks for C/D categories that require stricter medical standards
        if (dvlaResponse.categories && Array.isArray(dvlaResponse.categories)) {
            const professionalCategories = dvlaResponse.categories.filter((cat: any) =>
                ['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(cat.code || cat.categoryCode)
            );

            if (professionalCategories.length > 0) {
                factors.push(`Professional licence categories: ${professionalCategories.map(c => c.categoryCode).join(', ')}`);
                recommendations.push('Professional driver - ensure medical reviews are up to date');

                // Add slight risk increase for professional drivers
                score += 5;
            }
        } else if (dvlaResponse.entitlement && Array.isArray(dvlaResponse.entitlement)) {
            // DVLA sometimes uses 'entitlement' instead of 'categories'
            const professionalCategories = dvlaResponse.entitlement.filter((ent: any) =>
                ['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(ent.categoryCode)
            );

            if (professionalCategories.length > 0) {
                factors.push(`Professional licence categories: ${professionalCategories.map(c => c.categoryCode).join(', ')}`);
                recommendations.push('Professional driver - ensure medical reviews are up to date');

                // Add slight risk increase for professional drivers
                score += 5;
            }
        }

        // Category-specific risk assessment - detecting lost/restricted professional categories
        if (driver) {
            // Get current professional categories from DVLA response
            let currentProfessionalCats: string[] = [];

            if (dvlaResponse.categories && Array.isArray(dvlaResponse.categories)) {
                currentProfessionalCats = dvlaResponse.categories
                    .filter((cat: any) => ['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(cat.categoryCode))
                    .map((cat: any) => cat.categoryCode);
            } else if (dvlaResponse.entitlement && Array.isArray(dvlaResponse.entitlement)) {
                currentProfessionalCats = dvlaResponse.entitlement
                    .filter((ent: any) => ['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(ent.categoryCode))
                    .map((ent: any) => ent.categoryCode);
            }

            // Compare with previously stored categories (if available)
            if (driver.licenceCategories && Array.isArray(driver.licenceCategories)) {
                const previousProfessionalCats = driver.licenceCategories
                    .filter(cat => ['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(cat));

                // Check for lost categories
                const lostCategories = previousProfessionalCats.filter(cat =>
                    !currentProfessionalCats.includes(cat)
                );

                if (lostCategories.length > 0) {
                    score += 30; // High risk for lost professional categories
                    factors.push(`Lost professional licence categories: ${lostCategories.join(', ')}`);
                    recommendations.push('Immediate investigation required - professional driving categories lost');
                }

                // Check for downgraded categories (e.g., CE to C, DE to D)
                const downgrades = [];
                if (previousProfessionalCats.includes('CE') && !currentProfessionalCats.includes('CE') && currentProfessionalCats.includes('C')) {
                    downgrades.push('CE → C (lost trailer entitlement)');
                }
                if (previousProfessionalCats.includes('C1E') && !currentProfessionalCats.includes('C1E') && currentProfessionalCats.includes('C1')) {
                    downgrades.push('C1E → C1 (lost trailer entitlement)');
                }
                if (previousProfessionalCats.includes('DE') && !currentProfessionalCats.includes('DE') && currentProfessionalCats.includes('D')) {
                    downgrades.push('DE → D (lost trailer entitlement)');
                }
                if (previousProfessionalCats.includes('D1E') && !currentProfessionalCats.includes('D1E') && currentProfessionalCats.includes('D1')) {
                    downgrades.push('D1E → D1 (lost trailer entitlement)');
                }

                if (downgrades.length > 0) {
                    score += 20;
                    factors.push(`Category downgrades: ${downgrades.join(', ')}`);
                    recommendations.push('Review reason for category downgrade - may affect operational capability');
                }
            }

            // Check for category restrictions on professional licences
            let categoryRestrictions: string[] = [];

            if (dvlaResponse.categories && Array.isArray(dvlaResponse.categories)) {
                dvlaResponse.categories.forEach((cat: any) => {
                    if (['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(cat.categoryCode)) {
                        if (cat.restrictions && Array.isArray(cat.restrictions) && cat.restrictions.length > 0) {
                            const restrictionCodes = cat.restrictions.map((r: any) => r.restrictionCode || r).join(', ');
                            categoryRestrictions.push(`${cat.categoryCode}: ${restrictionCodes}`);
                        }
                    }
                });
            } else if (dvlaResponse.entitlement && Array.isArray(dvlaResponse.entitlement)) {
                dvlaResponse.entitlement.forEach((ent: any) => {
                    if (['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(ent.categoryCode)) {
                        if (ent.restrictions && Array.isArray(ent.restrictions) && ent.restrictions.length > 0) {
                            const restrictionCodes = ent.restrictions.map((r: any) => r.restrictionCode || r).join(', ');
                            categoryRestrictions.push(`${ent.categoryCode}: ${restrictionCodes}`);
                        }
                    }
                });
            }

            if (categoryRestrictions.length > 0) {
                score += 15;
                factors.push(`Professional category restrictions: ${categoryRestrictions.join('; ')}`);
                recommendations.push('Verify compliance with professional licence restrictions');
            }

            // Check for provisional professional categories (shouldn't happen for working drivers)
            let provisionalProfessional: string[] = [];

            if (dvlaResponse.categories && Array.isArray(dvlaResponse.categories)) {
                provisionalProfessional = dvlaResponse.categories
                    .filter((cat: any) =>
                        ['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(cat.categoryCode) &&
                        (cat.categoryType === 'Provisional' || cat.provisionalEntitlement === true)
                    )
                    .map((cat: any) => cat.categoryCode);
            } else if (dvlaResponse.entitlement && Array.isArray(dvlaResponse.entitlement)) {
                provisionalProfessional = dvlaResponse.entitlement
                    .filter((ent: any) =>
                        ['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(ent.categoryCode) &&
                        (ent.categoryType === 'Provisional' || ent.provisionalEntitlement === true)
                    )
                    .map((ent: any) => ent.categoryCode);
            }

            if (provisionalProfessional.length > 0) {
                score += 25;
                factors.push(`Provisional professional categories: ${provisionalProfessional.join(', ')}`);
                recommendations.push('Professional categories are provisional - full licence required for commercial driving');
            }

            // Check for expired professional categories
            let expiredProfessional: string[] = [];
            const now = new Date();

            if (dvlaResponse.categories && Array.isArray(dvlaResponse.categories)) {
                dvlaResponse.categories.forEach((cat: any) => {
                    if (['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(cat.categoryCode)) {
                        if (cat.expiryDate || cat.validToDate) {
                            try {
                                const expiryDate = new Date(cat.expiryDate || cat.validToDate);
                                if (expiryDate < now) {
                                    expiredProfessional.push(cat.categoryCode);
                                }
                            } catch (error) {
                                console.warn('Invalid category expiry date:', cat.expiryDate || cat.validToDate);
                            }
                        }
                    }
                });
            } else if (dvlaResponse.entitlement && Array.isArray(dvlaResponse.entitlement)) {
                dvlaResponse.entitlement.forEach((ent: any) => {
                    if (['C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'].includes(ent.categoryCode)) {
                        if (ent.expiryDate || ent.validToDate) {
                            try {
                                const expiryDate = new Date(ent.expiryDate || ent.validToDate);
                                if (expiryDate < now) {
                                    expiredProfessional.push(ent.categoryCode);
                                }
                            } catch (error) {
                                console.warn('Invalid category expiry date:', ent.expiryDate || ent.validToDate);
                            }
                        }
                    }
                });
            }

            if (expiredProfessional.length > 0) {
                score += 35; // Very high risk - can't legally drive professionally
                factors.push(`Expired professional categories: ${expiredProfessional.join(', ')}`);
                recommendations.push('Professional categories expired - immediate renewal required before commercial driving');
            }
        }















        // Advanced Pattern Detection - Escalating severity and frequency analysis
        if (endorsements.length > 0) {
            // Sort endorsements by date (most recent first)
            const sortedEndorsements = endorsements
                .filter(endorsement => endorsement.dateOfConviction)
                .sort((a, b) => new Date(b.dateOfConviction).getTime() - new Date(a.dateOfConviction).getTime());

            // 1. ESCALATING SEVERITY PATTERN DETECTION
            // Define severity levels for different offence types
            const getSeverityLevel = (offenceCode: string): number => {
                // Level 4: Most serious (drink/drug driving, dangerous driving)
                if (['DR10', 'DR20', 'DR30', 'DR40', 'DR50', 'DR60', 'DR70', 'DR80', 'DD40', 'DD60', 'DD80', 'CD40', 'CD50', 'CD60'].includes(offenceCode)) {
                    return 4;
                }
                // Level 3: Serious (careless driving, construction & use, insurance)
                if (['CD10', 'CD20', 'CD30', 'IN10', 'IN20', 'IN30', 'LC20', 'LC30', 'LC40', 'LC50', 'UT50'].includes(offenceCode)) {
                    return 3;
                }
                // Level 2: Moderate (speeding 30+ mph over, mobile phone, no seatbelt)
                if (['SP50', 'SP60', 'CU80', 'CU40'].includes(offenceCode)) {
                    return 2;
                }
                // Level 1: Minor (standard speeding, parking, documentation)
                return 1;
            };

            // Check for escalating severity pattern in recent endorsements
            if (sortedEndorsements.length >= 3) {
                const recentThree = sortedEndorsements.slice(0, 3);
                const severityLevels = recentThree.map(e => getSeverityLevel(e.code));

                // Check if severity is increasing over time (reverse order since sorted newest first)
                const isEscalating = severityLevels[2] < severityLevels[1] && severityLevels[1] < severityLevels[0];

                if (isEscalating) {
                    score += 25;
                    factors.push(`Escalating severity pattern: ${recentThree.map(e => e.code).reverse().join(' → ')}`);
                    recommendations.push('Escalating offence severity detected - intervention recommended');
                }
            }

            // 2. FREQUENCY ACCELERATION DETECTION
            // Analyze violation frequency over different time periods
            const now = new Date();
            const sixMonthsAgo = new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
            const oneYearAgo = new Date(now.getTime() - (12 * 30 * 24 * 60 * 60 * 1000));
            const twoYearsAgo = new Date(now.getTime() - (24 * 30 * 24 * 60 * 60 * 1000));

            let recentSixMonths = 0;
            let recentYear = 0;
            let recentTwoYears = 0;

            endorsements.forEach(endorsement => {
                try {
                    const convictionDate = new Date(endorsement.dateOfConviction);
                    if (convictionDate > sixMonthsAgo) recentSixMonths++;
                    if (convictionDate > oneYearAgo) recentYear++;
                    if (convictionDate > twoYearsAgo) recentTwoYears++;
                } catch (error) {
                    console.warn('Invalid conviction date in pattern detection:', endorsement.dateOfConviction);
                }
            });

            // Calculate frequency rates (violations per month)
            const sixMonthRate = recentSixMonths / 6;
            const yearRate = recentYear / 12;
            const twoYearRate = recentTwoYears / 24;

            // Detect frequency acceleration
            if (sixMonthRate > yearRate * 1.5 && yearRate > 0) {
                score += 20;
                factors.push(`Frequency acceleration: ${recentSixMonths} violations in 6 months vs ${recentYear} in full year`);
                recommendations.push('Violation frequency increasing - enhanced monitoring required');
            }

            // 3. REPEAT OFFENDER PATTERN DETECTION
            // Group violations by type to detect repeat patterns
            const offenceGroups: { [key: string]: number } = {};

            endorsements.forEach(endorsement => {
                const code = endorsement.code;
                if (code) {
                    // Group similar offences
                    const groupKey = code.substring(0, 2); // SP, DR, DD, etc.
                    offenceGroups[groupKey] = (offenceGroups[groupKey] || 0) + 1;
                }
            });

            // Check for repeat offence patterns
            Object.entries(offenceGroups).forEach(([group, count]) => {
                if (count >= 3) {
                    const groupName = getOffenceGroupName(group);
                    score += 15;
                    factors.push(`Repeat ${groupName} offences (${count} incidents)`);
                    recommendations.push(`Pattern of ${groupName} violations - targeted intervention needed`);
                }
            });

            // 4. TEMPORAL CLUSTERING DETECTION
            // Detect multiple violations in short time periods
            const clusters = findTemporalClusters(sortedEndorsements, 90); // 90-day clusters

            clusters.forEach(cluster => {
                if (cluster.count >= 2) {
                    score += 10 * cluster.count;
                    factors.push(`${cluster.count} violations within ${cluster.daySpan} days`);
                    recommendations.push('Multiple violations in short period - immediate review required');
                }
            });

            // 5. BEHAVIORAL TREND ANALYSIS
            // Compare recent behavior vs historical behavior
            if (sortedEndorsements.length >= 4) {
                const recentHalf = sortedEndorsements.slice(0, Math.floor(sortedEndorsements.length / 2));
                const olderHalf = sortedEndorsements.slice(Math.floor(sortedEndorsements.length / 2));

                const recentAvgSeverity = recentHalf.reduce((sum, e) => sum + getSeverityLevel(e.code), 0) / recentHalf.length;
                const olderAvgSeverity = olderHalf.reduce((sum, e) => sum + getSeverityLevel(e.code), 0) / olderHalf.length;

                if (recentAvgSeverity > olderAvgSeverity * 1.3) {
                    score += 15;
                    factors.push('Behavioral deterioration: recent violations more serious than historical pattern');
                    recommendations.push('Declining compliance trend - consider additional training or assessment');
                }
            }
        }

        // Helper function to get offence group names
        function getOffenceGroupName(group: string): string {
            const groupNames: { [key: string]: string } = {
                'SP': 'speeding',
                'DR': 'drink/drug driving',
                'DD': 'dangerous driving',
                'CD': 'careless driving',
                'IN': 'insurance',
                'LC': 'construction & use',
                'CU': 'mobile phone/seatbelt',
                'MS': 'failure to provide information',
                'UT': 'unauthorized taking'
            };
            return groupNames[group] || group;
        }

        // Helper function to find temporal clusters of violations
        function findTemporalClusters(endorsements: any[], maxDaysBetween: number): Array<{ count: number, daySpan: number }> {
            const clusters: Array<{ count: number, daySpan: number }> = [];

            for (let i = 0; i < endorsements.length - 1; i++) {
                let clusterCount = 1;
                const startDate = new Date(endorsements[i].dateOfConviction);
                let endDate = startDate;

                for (let j = i + 1; j < endorsements.length; j++) {
                    const currentDate = new Date(endorsements[j].dateOfConviction);
                    const daysDiff = Math.abs((startDate.getTime() - currentDate.getTime()) / (24 * 60 * 60 * 1000));

                    if (daysDiff <= maxDaysBetween) {
                        clusterCount++;
                        if (currentDate < endDate) endDate = currentDate;
                    } else {
                        break;
                    }
                }

                if (clusterCount >= 2) {
                    const daySpan = Math.abs((startDate.getTime() - endDate.getTime()) / (24 * 60 * 60 * 1000));
                    clusters.push({ count: clusterCount, daySpan: Math.round(daySpan) });
                    i += clusterCount - 1; // Skip processed endorsements
                }
            }

            return clusters;
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