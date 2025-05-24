import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { organisation } from './organisation.entity';
import { LicenceCheck } from './licence-check.entity';

@Entity('drivers')
export class Driver {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column({ unique: true })
    drivingLicenceNumber: string;

    @Column({ nullable: true })
    dateOfBirth: Date;

    @Column({ nullable: true })
    addressLine1: string;

    @Column({ nullable: true })
    addressLine2: string;

    @Column({ nullable: true })
    city: string;

    @Column({ nullable: true })
    postcode: string;

    @Column({ nullable: true })
    phoneNumber: string;

    @Column({ nullable: true })
    email: string;

    @Column({ nullable: true })
    licenceImageUrl: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    consentProvided: boolean;

    @Column({ nullable: true })
    consentDate: Date;

    @Column({ nullable: true })
    consentExpiryDate: Date;

    @Column()
    organisationId: string;

    @ManyToOne(() => organisation)
    @JoinColumn({ name: 'organisationId' })
    organisation: organisation;

    @OneToMany(() => LicenceCheck, licenceCheck => licenceCheck.driver)
    licenceChecks: LicenceCheck[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}