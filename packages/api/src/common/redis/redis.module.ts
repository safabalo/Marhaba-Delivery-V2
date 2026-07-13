import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRedisClient,
  REDIS_CLIENT,
  REDIS_SUBSCRIBER,
  RedisService,
} from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createRedisClient(config),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createRedisClient(config),
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule {}
