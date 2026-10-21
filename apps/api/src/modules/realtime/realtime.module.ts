import { Global, Module } from '@nestjs/common';
import { TokensService } from '../../common/auth/tokens.service.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Global()
@Module({
  providers: [RealtimeGateway, TokensService],
  exports: [RealtimeGateway, TokensService],
})
export class RealtimeModule {}
