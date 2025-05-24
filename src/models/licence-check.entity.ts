import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Driver } from './driver.entity';
import { User } from './user.entity';

@Entity('licence_checks')
export class LicenceCheck {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    driverId: string;

    @ManyToOne(() => Driver)
    @JoinColumn({ name: 'driverId' })
    driver: Driver;

    @Column({ nullable: true })
    checkedById: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'checkedById' })
    checkedBy: User;

    @Column()
    checkDate: Date;

    @Column()
    isValid: boolean;

    @Column({ nullable: true })
    expiryDate: Date;

    @Column('simple-array', { nullable: true })
    categories: string[];

    @Column({ default: 0 })
    penaltyPoints: number;

    @Column({ type: 'jsonb', nullable: true })
    endorsements: any[];

    @Column({ type: 'jsonb', nullable: true })
    restrictions: any[];

    @Column({ nullable: true })
    cpcExpiryDate: Date;

    @Column({ nullable: true })
    tachoCardStatus: string;

    @Column({ nullable: true })
    medicalDueDate: Date;

    @Column({ type: 'jsonb', nullable: true })
    rawResponse: any;

    @Column({ nullable: true })
    nextCheckDate: Date;

    @Column({ default: 'low' })
    riskLevel: string;

    @CreateDateColumn()
    createdAt: Date;
}