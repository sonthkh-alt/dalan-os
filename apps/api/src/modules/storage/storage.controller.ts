import { Controller, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { RequirePermissions } from '../../common/auth/auth.guard.js';
import { Errors } from '../../common/errors.js';
import { StorageService } from './storage.service.js';

@ApiTags('storage')
@ApiBearerAuth()
@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Tải lên một tệp (multipart field `file`); `folder` gợi ý: menu, inventory, events, customers. */
  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions('menu.manage', 'inventory.manage', 'event.manage', 'branch.update', 'customer.manage')
  async upload(@Req() req: FastifyRequest, @Query('folder') folder = 'uploads') {
    if (!req.isMultipart()) throw Errors.invalid('MULTIPART_REQUIRED', 'Gửi tệp dạng multipart/form-data với trường "file"');
    const part = await req.file();
    if (!part) throw Errors.invalid('FILE_REQUIRED', 'Thiếu tệp');
    const buffer = await part.toBuffer();
    return this.storage.store(buffer, part.mimetype, part.filename, folder);
  }
}
