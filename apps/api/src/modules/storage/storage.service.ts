import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, type UploadResult } from '@dalan/contracts';
import { ENV, type Env } from '../../config/env.js';
import { Errors } from '../../common/errors.js';

export interface StoredObject {
  path: string;
  url: string;
}

/** Giao diện lưu trữ tệp: cục bộ (dev, một máy chủ) hoặc S3 tương thích (production nhiều bản). */
export interface StorageProvider {
  put(input: { buffer: Buffer; mimeType: string; originalName: string; folder: string }): Promise<StoredObject>;
}

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };

export class LocalStorageProvider implements StorageProvider {
  constructor(
    readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  async put(input: { buffer: Buffer; mimeType: string; originalName: string; folder: string }): Promise<StoredObject> {
    const now = new Date();
    const ext = EXT_BY_MIME[input.mimeType] ?? extname(input.originalName).toLowerCase() ?? '';
    const rel = `${input.folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;
    const abs = join(this.rootDir, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, input.buffer);
    return { path: rel, url: `${this.publicBaseUrl}/files/${rel}` };
  }
}

/** Khung S3 (MinIO, AWS, VNG Cloud): hoàn thiện khi triển khai production nhiều bản API. */
export class S3StorageProvider implements StorageProvider {
  async put(): Promise<StoredObject> {
    throw Errors.state('Lưu trữ S3 chưa cấu hình (TODO: dùng @aws-sdk/client-s3 với S3_ENDPOINT, S3_BUCKET)');
  }
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  readonly provider: StorageProvider;
  private readonly localDir: string;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly adapterHost: HttpAdapterHost,
  ) {
    this.localDir = resolve(process.cwd(), env.STORAGE_LOCAL_DIR);
    this.provider = env.STORAGE_PROVIDER === 's3' ? new S3StorageProvider() : new LocalStorageProvider(this.localDir, env.API_PUBLIC_URL.replace(/\/$/, ''));
  }

  /** Đăng ký multipart và phục vụ tệp tĩnh /files/* (chạy trong init, trước khi Fastify sẵn sàng). */
  async onModuleInit(): Promise<void> {
    const instance = this.adapterHost.httpAdapter?.getInstance<FastifyInstance>();
    if (!instance) return;
    await mkdir(this.localDir, { recursive: true });
    await instance.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
    if (this.env.STORAGE_PROVIDER === 'local') {
      await instance.register(fastifyStatic, { root: this.localDir, prefix: '/files/', decorateReply: false, index: false, cacheControl: true, maxAge: '7d' });
      this.logger.log(`Phục vụ tệp cục bộ từ ${this.localDir} tại /files/`);
    }
  }

  async store(buffer: Buffer, mimeType: string, originalName: string, folder: string): Promise<UploadResult> {
    if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw Errors.invalid('UNSUPPORTED_FILE', `Chỉ nhận ảnh JPG, PNG, WEBP, GIF hoặc PDF (nhận ${mimeType})`);
    }
    if (buffer.length === 0) throw Errors.invalid('EMPTY_FILE', 'Tệp rỗng');
    if (buffer.length > MAX_UPLOAD_BYTES) throw Errors.invalid('FILE_TOO_LARGE', 'Tệp vượt 5 MB');
    const safeFolder = folder.replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'uploads';
    const stored = await this.provider.put({ buffer, mimeType, originalName, folder: safeFolder });
    return { url: stored.url, path: stored.path, size: buffer.length, mimeType, originalName };
  }
}
