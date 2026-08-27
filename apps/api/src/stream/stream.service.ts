import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { LibraryService } from '../library/library.service';

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  opus: 'audio/ogg',
};

@Injectable()
export class StreamService {
  constructor(
    private readonly library: LibraryService,
    private readonly config: AppConfigService,
  ) {}

  stream(trackId: number, req: Request, res: Response): void {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute || !existsSync(absolute)) {
      throw new NotFoundException('Audio file is missing from the library');
    }

    const stat = statSync(absolute);
    const mime = MIME[track.format] ?? 'application/octet-stream';
    const range = req.headers.range;

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (!range) {
      res.setHeader('Content-Length', stat.size);
      createReadStream(absolute).pipe(res);
      return;
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      res.status(416).end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
      return;
    }
    const chunkEnd = Math.min(end, stat.size - 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${chunkEnd}/${stat.size}`);
    res.setHeader('Content-Length', chunkEnd - start + 1);
    createReadStream(absolute, { start, end: chunkEnd }).pipe(res);
  }
}
