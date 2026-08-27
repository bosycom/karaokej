import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LibraryService } from '../library/library.service';
import { LyricsService } from '../lyrics/lyrics.service';
import { StreamService } from '../stream/stream.service';
import { trackToDto } from '../db/types';
import { NotFoundException } from '@nestjs/common';

@Controller('tracks')
export class TracksController {
  constructor(
    private readonly library: LibraryService,
    private readonly lyrics: LyricsService,
    private readonly stream: StreamService,
  ) {}

  @Get()
  search(
    @Query('q') q = '',
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.library.search(q, Number(page) || 1, Number(limit) || 50);
  }

  @Get(':id/audio')
  audio(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.stream.stream(id, req, res);
  }

  @Get(':id/lyrics')
  lyricsFor(@Param('id', ParseIntPipe) id: number) {
    return this.lyrics.getParsed(id);
  }

  @Post(':id/lyrics/fetch')
  fetchLyrics(@Param('id', ParseIntPipe) id: number) {
    return this.lyrics.fetchTrack(id);
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number) {
    const track = this.library.getTrack(id);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    return trackToDto(track);
  }
}
