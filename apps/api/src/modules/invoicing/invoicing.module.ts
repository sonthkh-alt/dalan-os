import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InvoicingController } from './invoicing.controller.js';
import { InvoicingProcessor } from './invoicing.processor.js';
import { InvoicingService } from './invoicing.service.js';
import { MockEInvoiceProvider } from './providers/mock.provider.js';
import { MisaMeInvoiceProvider } from './providers/misa.provider.js';
import { ViettelSInvoiceProvider } from './providers/viettel.provider.js';
import { VnptInvoiceProvider } from './providers/vnpt.provider.js';
import { EINVOICE_QUEUE } from './queue.js';

@Module({
  imports: [BullModule.registerQueue({ name: EINVOICE_QUEUE })],
  controllers: [InvoicingController],
  providers: [InvoicingService, InvoicingProcessor, MockEInvoiceProvider, MisaMeInvoiceProvider, ViettelSInvoiceProvider, VnptInvoiceProvider],
  exports: [InvoicingService],
})
export class InvoicingModule {}
