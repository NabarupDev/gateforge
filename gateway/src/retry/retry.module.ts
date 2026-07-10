import { Module } from '@nestjs/common';
import { RetryController } from './retry.controller';

@Module({
  controllers: [RetryController],
})
export class RetryModule {}
