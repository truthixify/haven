import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { ConnectionEntity } from './entities/connection.entity';
import { ScoreHistoryEntity } from './entities/score-history.entity';
import { DatabaseService } from './database.service';
import { ScoreHistoryService } from './score-history.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ConnectionEntity, ScoreHistoryEntity])],
  providers: [DatabaseService, ScoreHistoryService],
  exports: [DatabaseService, ScoreHistoryService],
})
export class StorageModule {}
