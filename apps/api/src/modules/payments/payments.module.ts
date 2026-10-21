import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PAYMENTS_GATEWAY } from '../billing/billing.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { MockPaymentProvider } from './providers/mock.provider.js';
import { VnPayProvider } from './providers/vnpay.provider.js';
import { MoMoProvider } from './providers/momo.provider.js';
import { ZaloPayProvider } from './providers/zalopay.provider.js';
import { OnePayProvider } from './providers/onepay.provider.js';

@Module({
  imports: [BillingModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPaymentProvider, VnPayProvider, MoMoProvider, ZaloPayProvider, OnePayProvider, { provide: PAYMENTS_GATEWAY, useExisting: PaymentsService }],
  exports: [PaymentsService, PAYMENTS_GATEWAY],
})
export class PaymentsModule {}
