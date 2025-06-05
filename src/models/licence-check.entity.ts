import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Driver } from './driver.entity';
import { Organisation } from './organisation.entity';

@Entity('licence_checks')
export class LicenceCheck {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'driver_id' })
    driverId: string;

    @Column({ name: 'organisation_id' })
    organisationId: string;

    @Column({ name: 'checked_by' })
    checkedBy: string;

    @CreateDateColumn({ name: 'check_date' })
    checkDate: Date;

    @Column({ default: false })
    valid: boolean;

    @Column({ nullable: true })
    status: string;

    @Column({ name: 'status_code', nullable: true })
    statusCode: string;

    @Column({ name: 'licence_type', nullable: true })
    licenceType: string;

    @Column({ type: 'jsonb', nullable: true })
    categories: any[];

    @Column({ name: 'penalty_points', default: 0 })
    penaltyPoints: number;

    @Column({ type: 'jsonb', nullable: true })
    endorsements: any[];

    @Column({ type: 'jsonb', nullable: true })
    disqualifications: any[];

    @Column({ type: 'jsonb', nullable: true })
    restrictions: any[];

    @Column({ name: 'expiry_date', type: 'date', nullable: true })
    expiryDate: Date | null;

    @Column({ name: 'issue_date', type: 'date', nullable: true })
    issueDate: Date | null;

    @Column({ name: 'risk_level', type: 'enum', enum: ['low', 'medium', 'high'], default: 'low' })
    riskLevel: 'low' | 'medium' | 'high';

    @Column({ name: 'risk_score', default: 0 })
    riskScore: number;

    @Column({ name: 'risk_factors', type: 'jsonb', nullable: true })
    riskFactors: string[];

    @Column({ name: 'next_check_due', type: 'date', nullable: true })
    nextCheckDue: Date;

    @Column({ name: 'cpc_details', type: 'jsonb', nullable: true })
    cpcDetails: any;

    @Column({ name: 'tachograph_details', type: 'jsonb', nullable: true })
    tachographDetails: any;

    @Column({ name: 'error_message', nullable: true })
    errorMessage: string;

    @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
    rawResponse: any;

    // Relations
    @ManyToOne(() => Driver)
    @JoinColumn({ name: 'driver_id' })
    driver: Driver;

    @ManyToOne(() => Organisation)
    @JoinColumn({ name: 'organisation_id' })
    organisation: Organisation;
}