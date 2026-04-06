import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryColumn({ type: 'varchar' })
  identityCommitment: string;

  @Column({ type: 'varchar' })
  ckbPubKey: string;

  @Column({ type: 'varchar', nullable: true })
  lockCodeHash: string | null;

  @Column({ type: 'varchar', nullable: true })
  lockHashType: string | null;

  @Column({ type: 'varchar', nullable: true })
  lockArgs: string | null;

  @Column({ type: 'int', nullable: true })
  lastScoredEpoch: number | null;

  @Column({ type: 'int', nullable: true })
  lastComputedScore: number | null;

  @Column({ type: 'jsonb', nullable: true })
  scoreCellOutpoint: { txHash: string; index: number } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
