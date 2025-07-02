// src/models/driver.entity.ts - Complete updated version
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Organisation } from './organisation.entity';
import { LicenceCheck } from './licence-check.entity';

@Entity('drivers')
export class Driver {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'organisation_id', nullable: true }) // Temporarily nullable
    organisationId: string;

    @Column({ name: 'first_name' })
    firstName: string;

    @Column({ name: 'last_name' })
    lastName: string;

    @Column({ name: 'licence_number' })
    licenceNumber: string;

    @Column({ name: 'date_of_birth', type: 'date' })
    dateOfBirth: Date;

    @Column()
    email: string;

    @Column({ nullable: true })
    phone: string;

    @Column({ name: 'address_line_1' })
    addressLine1: string;

    @Column({ name: 'address_line_2', nullable: true })
    addressLine2: string;

    @Column()
    city: string;

    @Column()
    postcode: string;

    @Column({ name: 'consent_provided', default: false })
    consentProvided: boolean;

    @Column({ name: 'consent_date', nullable: true })
    consentDate: Date;

    @Column({ name: 'consent_expiry', nullable: true })
    consentExpiry: Date;

    @Column({ name: 'consent_reference', nullable: true })
    consentReference: string;

    @Column({ name: 'last_medical_date', type: 'date', nullable: true })
    lastMedicalDate: Date | null;

    // LICENCE TRACKING FIELDS
    @Column({ name: 'licence_status', type: 'enum', enum: ['unknown', 'valid', 'invalid', 'expired'], default: 'unknown' })
    licenceStatus: 'unknown' | 'valid' | 'invalid' | 'expired';

    @Column({ name: 'last_licence_check', nullable: true })
    lastLicenceCheck: Date;

    @Column({ name: 'risk_level', type: 'enum', enum: ['low', 'medium', 'high'], default: 'low' })
    riskLevel: 'low' | 'medium' | 'high';

    @Column({ name: 'penalty_points', default: 0 })
    penaltyPoints: number;

    @Column({ name: 'licence_issue_date', type: 'date', nullable: true })
    licenceIssueDate: Date | null;

    @Column({ name: 'cpc_expiry_date', type: 'date', nullable: true })
    cpcExpiryDate: Date | null;

    @Column({ name: 'medical_review_date', type: 'date', nullable: true })
    medicalReviewDate: Date;

    @Column({ name: 'licence_categories', type: 'jsonb', nullable: true })
    licenceCategories: string[];

    @Column({ default: true })
    active: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // Relations
    @ManyToOne(() => Organisation)
    @JoinColumn({ name: 'organisation_id' })
    organisation: Organisation;

    @OneToMany(() => LicenceCheck, licenceCheck => licenceCheck.driver)
    licenceChecks: LicenceCheck[];

    // Virtual fields for API responses
    get fullName(): string {
        return `${this.firstName} ${this.lastName}`;
    }

    get consentValid(): boolean {
        if (!this.consentProvided || !this.consentExpiry) return false;
        return this.consentExpiry > new Date();
    }

    get requiresLicenceCheck(): boolean {
        if (!this.lastLicenceCheck) return true;

        // Check based on risk level
        const now = new Date();
        const lastCheck = new Date(this.lastLicenceCheck);

        switch (this.riskLevel) {
            case 'high':
                // Monthly checks for high risk
                return (now.getTime() - lastCheck.getTime()) > (30 * 24 * 60 * 60 * 1000);
            case 'medium':
                // Quarterly checks for medium risk
                return (now.getTime() - lastCheck.getTime()) > (90 * 24 * 60 * 60 * 1000);
            case 'low':
                // Bi-annual checks for low risk
                return (now.getTime() - lastCheck.getTime()) > (180 * 24 * 60 * 60 * 1000);
            default:
                return true;
        }
    }
}