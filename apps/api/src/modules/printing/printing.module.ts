import { Global, Module } from '@nestjs/common';
import { PrintingController } from './printing.controller.js';
import { PrintingService } from './printing.service.js';

@Global()
@Module({
  controllers: [PrintingController],
  providers: [PrintingService],
  exports: [PrintingService],
})
export class PrintingModule {}
