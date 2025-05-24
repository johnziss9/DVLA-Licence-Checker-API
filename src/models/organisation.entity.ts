import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum organisationType {
    FLEET = 'fleet', // Companies that own their own vehicles
    RECRUITMENT = 'recruitment', // Recruitment agencies that place drivers
    COMPLIANCE = 'compliance' // Third-party compliance services or consultancies that manage driver compliance on behalf of others
}

@Entity('organisations')
export class organisation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({
        type: 'enum',
        enum: organisationType
    })
    type: organisationType;

    @Column()
    contactEmail: string;

    @Column({ nullable: true })
    contactPhone: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'int', default: 30 })
    recheckInterval: number; // in days

    @Column('simple-array', { nullable: true })
    alertEmails: string[];

    @Column({ default: false })
    enableSmsAlerts: boolean;

    @Column({ nullable: true })
    logoUrl: string;

    @Column({ default: '#1976d2' })
    primaryColor: string;

    @Column({ default: '#424242' })
    secondaryColor: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}