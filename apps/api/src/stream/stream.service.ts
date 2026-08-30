import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, statSync, type Stats } from 'node:fs';
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
    this.library.backfillDurationIfMissing(trackId);
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute) {
      throw new NotFoundException('Audio file is missing from the library');
    }

    const mime = MIME[track.format] ?? 'application/octet-stream';
    this.streamFile(absolute, mime, req, res);
  }

  streamFile(absolutePath: string, mime: string, req: Request, res: Response): void {
    let stat: Stats;
    try {
      stat = statSync(absolutePath);
    } catch {
      // Also covers a file the filesystem reports as pending deletion, which an SMB
      // share does while another handle is still open.
      throw new NotFoundException('Audio file is missing from the library');
    }
    const range = req.headers.range;

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Last-Modified', new Date(stat.mtimeMs).toUTCString());
    res.setHeader('ETag', `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`);

    if (!range) {
      res.setHeader('Content-Length', stat.size);
      this.pipe(createReadStream(absolutePath), res);
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
    this.pipe(createReadStream(absolutePath, { start, end: chunkEnd }), res);
  }

  /**
   * A read error mid-response cannot be turned into a status code any more, so the
   * connection is dropped instead of letting the error surface unhandled.
   */
  private pipe(source: ReturnType<typeof createReadStream>, res: Response): void {
    source.on('error', () => {
      source.destroy();
      res.destroy();
    });
    res.on('close', () => source.destroy());
    source.pipe(res);
  }
}
