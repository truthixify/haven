import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { ConnectionEntity } from './entities/connection.entity';
import { DatabaseService } from './database.service';

/**
 * Storage module is global so all other modules can access the database
 * without explicitly importing it.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ConnectionEntity])],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class StorageModule {}
