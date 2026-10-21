import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  otpRequestSchema,
  otpVerifySchema,
  pinLoginSchema,
  refreshSchema,
  registerDeviceSchema,
  staffLoginSchema,
  type PinLoginInput,
  type RegisterDeviceInput,
  type StaffLoginInput,
  type ZaloLoginInput,
  zaloLoginSchema,
} from '@dalan/contracts';
import type { z } from 'zod';
import { CurrentStaff, Public, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('staff/login')
  @HttpCode(200)
  staffLogin(@Body({ schema: staffLoginSchema }) body: StaffLoginInput) {
    return this.auth.staffLoginWithPassword(body.login, body.password, body.branchId);
  }

  @Public()
  @Get('staff/device')
  staffForDevice(@Headers('x-device-token') deviceToken?: string) {
    if (!deviceToken) throw Errors.unauthorized('Thiếu token thiết bị');
    return this.auth.staffForDevice(deviceToken);
  }

  @Public()
  @Post('staff/pin')
  @HttpCode(200)
  staffPin(@Body({ schema: pinLoginSchema }) body: PinLoginInput, @Headers('x-device-token') deviceToken?: string) {
    if (!deviceToken) throw Errors.unauthorized('Thiếu token thiết bị');
    return this.auth.staffLoginWithPin(deviceToken, body.staffId, body.pin);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body({ schema: refreshSchema }) body: z.infer<typeof refreshSchema>) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: { refreshToken?: string } | undefined) {
    await this.auth.logout(body?.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentStaff() staff: StaffPrincipal) {
    return this.auth.me(staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('staff.device', 'staff.manage')
  @Post('devices')
  registerDevice(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: registerDeviceSchema }) body: RegisterDeviceInput) {
    return this.auth.registerDevice(staff, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('staff.device', 'staff.manage')
  @Delete('devices/:deviceId')
  @HttpCode(204)
  async revokeDevice(@Param('deviceId') deviceId: string) {
    await this.auth.revokeDevice(deviceId);
  }

  @Public()
  @Post('customer/otp/request')
  @HttpCode(200)
  requestOtp(@Body({ schema: otpRequestSchema }) body: z.infer<typeof otpRequestSchema>) {
    return this.auth.requestOtp(body.phone, body.purpose);
  }

  @Public()
  @Post('customer/otp/verify')
  @HttpCode(200)
  verifyOtp(@Body({ schema: otpVerifySchema }) body: z.infer<typeof otpVerifySchema>) {
    return this.auth.verifyOtp(body.phone, body.code, body.purpose, body.fullName);
  }

  /** Zalo Mini App: accessToken (+ phoneToken) từ zmp-sdk → token khách thành viên. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('customer/zalo')
  @HttpCode(200)
  zaloLogin(@Body({ schema: zaloLoginSchema }) body: ZaloLoginInput) {
    return this.auth.loginWithZalo(body.accessToken, body.phoneToken);
  }
}
