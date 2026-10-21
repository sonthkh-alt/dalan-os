import { All, Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createPaymentIntentSchema, type CreatePaymentIntentInput } from '@dalan/contracts';
import { AllowGuest, CurrentPrincipal, Public, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { Principal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Tạo giao dịch cổng/ví cho bill (thu ngân hoặc khách tại bàn). */
  @ApiBearerAuth()
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('billing.collect')
  @Post('bills/:billId/payment-intents')
  create(@Param('billId') billId: string, @Body({ schema: createPaymentIntentSchema }) body: CreatePaymentIntentInput, @CurrentPrincipal() principal: Principal | undefined, @Req() req: FastifyRequest) {
    if (!principal) throw Errors.unauthorized();
    return this.payments.createIntentForBill(billId, body, principal, req.ip);
  }

  @ApiBearerAuth()
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('billing.collect', 'billing.read')
  @Get('payment-intents/:intentId')
  get(@Param('intentId') intentId: string, @CurrentPrincipal() principal: Principal | undefined) {
    if (!principal) throw Errors.unauthorized();
    return this.payments.getIntent(intentId, principal);
  }

  @ApiBearerAuth()
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('billing.collect')
  @Post('payment-intents/:intentId/cancel')
  @HttpCode(200)
  cancel(@Param('intentId') intentId: string, @CurrentPrincipal() principal: Principal | undefined) {
    if (!principal) throw Errors.unauthorized();
    return this.payments.cancelIntent(intentId, principal);
  }

  /** Phương thức cổng/ví khả dụng cho cơ sở (app khách hiện nút phù hợp). */
  @ApiBearerAuth()
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('billing.collect', 'billing.read')
  @Get('branches/:branchId/payment-methods')
  methods(@Param('branchId') branchId: string, @CurrentPrincipal() principal: Principal | undefined) {
    if (principal?.kind === 'guest' && principal.branchId !== branchId) throw Errors.forbidden();
    return this.payments.availableMethods(branchId);
  }

  /** Webhook / IPN từ cổng thanh toán. Mỗi cổng có định dạng xác nhận riêng nên trả lời thủ công. */
  @Public()
  @All('webhooks/payments/:provider')
  async webhook(@Param('provider') provider: string, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ack = await this.payments.handleWebhook(provider.toLowerCase(), {
      method: req.method,
      headers: req.headers as Record<string, unknown>,
      query: (req.query ?? {}) as Record<string, unknown>,
      body: req.body,
    });
    void reply.status(ack.status).type(ack.contentType).send(ack.body === '' ? undefined : ack.body);
  }
}
