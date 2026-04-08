import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('score_history')
export class ScoreHistoryEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Index()
  @Column({ type: 'varchar' })
  identityCommitment: string;

  @Column({ type: 'int' })
  epoch: number;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'int', default: 0 })
  privacy: number;

  @Column({ type: 'int', default: 0 })
  contribution: number;

  @Column({ type: 'int', default: 0 })
  humanity: number;

  @Column({ type: 'int', default: 0 })
  community: number;

  @Column({ type: 'varchar', nullable: true })
  txHash: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
