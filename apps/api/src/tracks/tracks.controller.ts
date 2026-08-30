import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LibraryService } from '../library/library.service';
import { LyricsService } from '../lyrics/lyrics.service';
import { RatingService } from '../rating/rating.service';
import { TrackMetadataService } from '../metadata/track-metadata.service';
import { SeparationService } from '../karaoke/separation.service';
import { StreamService } from '../stream/stream.service';
import { NotFoundException } from '@nestjs/common';

@Controller('tracks')
export class TracksController {
  constructor(
    private readonly library: LibraryService,
    private readonly lyrics: LyricsService,
    private readonly stream: StreamService,
    private readonly ratings: RatingService,
    private readonly metadata: TrackMetadataService,
    private readonly separation: SeparationService,
  ) {}

  @Get()
  search(
    @Query('q') q = '',
    @Query('page') page = '1',
    @Query('limit') limit = '15',
    @Query('minRating') minRating?: string,
    @Query('hideDuplicates') hideDuplicates?: string,
  ) {
    const parsed =
      minRating == null || minRating === '' ? undefined : Number(minRating);
    const dedupe =
      hideDuplicates === '1' ||
      hideDuplicates === 'true' ||
      hideDuplicates === 'yes';
    return this.library.search(
      q,
      Number(page) || 1,
      Number(limit) || 15,
      parsed,
      dedupe,
    );
  }

  @Get(':id/audio')
  audio(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.stream.stream(id, req, res);
  }

  @Get(':id/karaoke-stem')
  karaokeStem(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const absolute = this.separation.getStemFilePath(id);
    this.stream.streamFile(absolute, 'audio/mpeg', req, res);
  }

  @Get(':id/lyrics')
  lyricsFor(@Param('id', ParseIntPipe) id: number) {
    return this.lyrics.getParsed(id);
  }

  @Post(':id/lyrics/fetch')
  fetchLyrics(@Param('id', ParseIntPipe) id: number) {
    return this.lyrics.fetchTrack(id);
  }

  @Get(':id/lyrics/search')
  searchLyrics(
    @Param('id', ParseIntPipe) id: number,
    @Query('q') q = '',
  ) {
    return this.lyrics.searchForTrack(id, q);
  }

  @Post(':id/lyrics/apply')
  applyLyrics(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { lrclibId?: unknown },
  ) {
    const lrclibId = Number(body?.lrclibId);
    return this.lyrics.applyRecord(id, lrclibId);
  }

  @Put(':id/rating')
  setRating(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { rating?: unknown },
  ) {
    return this.ratings.setRating(id, body?.rating);
  }

  @Get(':id/metadata')
  readMetadata(@Param('id', ParseIntPipe) id: number) {
    return this.metadata.readFromFile(id);
  }

  @Put(':id/metadata')
  updateMetadata(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.metadata.updateMetadata(id, body);
  }

  @Get(':id/path')
  path(@Param('id', ParseIntPipe) id: number) {
    return this.library.getTrackPath(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number): void {
    this.library.deleteTrackFile(id);
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number) {
    const track = this.library.getTrackDto(id);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    return track;
  }
}
