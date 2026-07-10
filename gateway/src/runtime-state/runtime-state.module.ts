import { Module, Global } from '@nestjs/common';
import { RUNTIME_STATE_STORE } from './interfaces/runtime-state-store.interface';
import { RedisRuntimeStateStore } from './stores/redis-runtime-state.store';
import { RateLimitModule } from '../rate-limit/rate-limit.module'; // To get REDIS_CLIENT

@Global()
@Module({
  imports: [RateLimitModule], // Ensures REDIS_CLIENT is available
  providers: [
    {
      provide: RUNTIME_STATE_STORE,
      useClass: RedisRuntimeStateStore,
    },
  ],
  exports: [RUNTIME_STATE_STORE],
})
export class RuntimeStateModule {}
