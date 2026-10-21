import { Logger, StandardSchemaValidationPipe, VersioningType } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { AppModule } from './app.module.js';
import { parseEnv } from './config/env.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor.js';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter.js';

export async function bootstrap(): Promise<void> {
  const env = parseEnv();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      bodyLimit: 5 * 1024 * 1024,
      genReqId: () => crypto.randomUUID(),
    }),
    { bufferLogs: false },
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  app.enableCors({
    origin: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((s) => s.trim()) : [env.STAFF_APP_URL, env.GUEST_APP_URL, /localhost:\d+$/],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Guest-Token', 'X-Branch-Id'],
    exposedHeaders: ['X-Idempotent-Replay'],
  });

  app.setGlobalPrefix('api', { exclude: ['health', 'q/:token', 'q/:token/join'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new BigIntInterceptor());
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.enableShutdownHooks();

  const redisAdapter = new RedisIoAdapter(app, env.REDIS_URL);
  await redisAdapter.connect();
  app.useWebSocketAdapter(redisAdapter);

  // Nest đăng ký bộ phân tích JSON trong init(); thay bằng bản cho phép body rỗng
  // (nhiều client gửi content-type JSON kèm POST không có body).
  await app.init();
  const fastify = app.getHttpAdapter().getInstance();
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 5 * 1024 * 1024 }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      e.statusCode = 400;
      done(e, undefined);
    }
  });

  const swagger = new DocumentBuilder()
    .setTitle('DaLan OS API')
    .setDescription('API quản lý và đặt món Nhà hàng Dạ Lan')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-guest-token', in: 'header' }, 'guest')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), {
    jsonDocumentUrl: 'docs/openapi.json',
  });

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  const adapterHost = app.get(HttpAdapterHost);
  void adapterHost;
  logger.log(`API sẵn sàng tại ${env.API_PUBLIC_URL} (docs: ${env.API_PUBLIC_URL}/docs)`);
}
