import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { CoverService } from './cover.service';
import { isCoverSize, type CoverFormat } from './cover-thumbnails';

const MIME: Record<CoverFormat, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
};

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

@Controller('covers')
export class CoversController {
  constructor(private readonly covers: CoverService) {}

  @Get(':groupKey/:size')
  async cover(
    @Param('groupKey') groupKey: string,
    @Param('size') size: string,
    @Query('v') version: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!/^[a-f0-9]{8,64}$/.test(groupKey)) {
      throw new BadRequestException('Invalid cover key');
    }
    const sizeKey = size.replace(/\.(webp|jpg|jpeg)$/i, '');
    if (!isCoverSize(sizeKey)) {
      throw new BadRequestException('Invalid cover size');
    }

    const resolved = await this.covers.ensureResolved(groupKey);
    if (resolved.status !== 'ready' || !resolved.hash) {
      // The client draws its placeholder; nothing useful to send.
      res.setHeader('Cache-Control', 'no-store');
      res.status(204).end();
      return;
    }

    const path = this.covers.coverPath(resolved.hash, sizeKey, resolved.format);
    if (!existsSync(path)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(204).end();
      return;
    }

    // A caller that already knows the hash is asking for immutable content.
    const pinned = version === resolved.hash;
    res.setHeader('Content-Type', MIME[resolved.format]);
    res.setHeader('Content-Length', statSync(path).size);
    res.setHeader('ETag', `"${resolved.hash}-${sizeKey}"`);
    res.setHeader('Cache-Control', pinned ? IMMUTABLE_CACHE : 'no-cache');
    createReadStream(path).pipe(res);
  }
}
