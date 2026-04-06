import { Module } from '@nestjs/common';
import { ChainService } from './chain.service';
import { RegistryService } from './registry.service';

@Module({
  providers: [ChainService, RegistryService],
  exports: [ChainService, RegistryService],
})
export class ChainModule {}
