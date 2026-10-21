import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module.js';
import { DiningController } from './dining.controller.js';
import { DiningService } from './dining.service.js';
import { GuestController } from './guest.controller.js';
import { QrController } from './qr.controller.js';

@Module({
  imports: [MenuModule],
  controllers: [DiningController, GuestController, QrController],
  providers: [DiningService],
  exports: [DiningService],
})
export class DiningModule {}
