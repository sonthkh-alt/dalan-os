import { Global, Module } from '@nestjs/common';
import { ENV, parseEnv } from './env.js';

/** Cung cấp biến môi trường đã kiểm tra cho toàn ứng dụng qua token ENV. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv() }],
  exports: [ENV],
})
export class EnvModule {}
