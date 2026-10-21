import { Module } from '@nestjs/common';
import { DiningModule } from '../dining/dining.module.js';
import { PublicReservationsController } from './public-reservations.controller.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [DiningModule],
  controllers: [ReservationsController, PublicReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
