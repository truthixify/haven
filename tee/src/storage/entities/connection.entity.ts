import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('connections')
@Unique('UQ_identity_provider', ['identityCommitment', 'provider'])
@Unique('UQ_provider_providerId', ['provider', 'providerId'])
export class ConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  identityCommitment: string; // FK to users table

  @Column({ type: 'varchar' })
  provider: string; // 'twitter', 'github', 'linkedin', 'discord', 'telegram', etc.

  @Column({ type: 'varchar' })
  providerId: string; // user's ID on that platform

  @Column({ type: 'varchar', nullable: true })
  accessToken: string | null;

  @Column({ type: 'varchar', nullable: true })
  refreshToken: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null; // provider-specific data (username, avatar, etc.)

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  reputationWeight: number; // how much this provider contributes to score (0-100)

  @CreateDateColumn()
  connectedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
