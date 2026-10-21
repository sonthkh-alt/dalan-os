import { Body, Controller, Get, HttpCode, Param, Post, Req, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { guestJoinSchema, type GuestJoinInput } from '@dalan/contracts';
import { Public } from '../../common/auth/auth.guard.js';
import { TokensService } from '../../common/auth/tokens.service.js';
import { DiningService } from './dining.service.js';

/**
 * Đường dẫn ngắn in trên mã QR bàn: https://<domain>/q/<token>.
 * Nằm ngoài tiền tố /api/v1 để QR gọn và không đổi khi nâng phiên bản API.
 */
@ApiTags('guest')
@Controller({ path: 'q', version: VERSION_NEUTRAL })
export class QrController {
  constructor(
    private readonly dining: DiningService,
    private readonly tokens: TokensService,
  ) {}

  @Public()
  @Get(':token')
  landing(@Param('token') token: string) {
    return this.dining.qrLanding(token);
  }

  @Public()
  @Post(':token/join')
  @HttpCode(200)
  async join(@Param('token') token: string, @Body({ schema: guestJoinSchema }) body: GuestJoinInput, @Req() req: FastifyRequest) {
    const result = await this.dining.guestJoin(token, { ...body, deviceFingerprint: body.deviceFingerprint ?? req.headers['user-agent']?.slice(0, 100) });
    const guestToken = await this.tokens.signGuest({ sessionId: result.session.id, participantId: result.participant.id, branchId: result.branch.id });
    return { guestToken, ...result };
  }
}
