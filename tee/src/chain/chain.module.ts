import { Module } from '@nestjs/common';
import { ChainService } from './chain.service';
import { ChainController } from './chain.controller';
import { RegistryService } from './registry.service';

@Module({
  controllers: [ChainController],
  providers: [ChainService, RegistryService],
  exports: [ChainService, RegistryService],
})
export class ChainModule {}
