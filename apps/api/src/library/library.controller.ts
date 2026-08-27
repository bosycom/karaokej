import { Controller, Get, Post } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LyricsService } from '../lyrics/lyrics.service';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly lyrics: LyricsService,
  ) {}

  @Get('status')
  status() {
    return this.library.status();
  }

  @Post('scan')
  async scan() {
    await this.library.startScan();
    return this.library.status();
  }

  @Post('scan/cancel')
  cancelScan() {
    this.library.cancelScan();
    return this.library.status();
  }

  @Post('fetch-lyrics')
  async fetchLyrics() {
    await this.lyrics.startFetch();
    return this.library.status();
  }

  @Post('fetch-lyrics/cancel')
  cancelFetchLyrics() {
    this.lyrics.cancelFetch();
    return this.library.status();
  }
}
