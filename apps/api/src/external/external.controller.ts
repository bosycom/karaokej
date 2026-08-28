import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  TrackDto,
  YoutubeDownloadResultDto,
  YoutubeSearchResultDto,
} from '@karaokej/shared';
import { YtdlpService } from './ytdlp.service';
import { YtsaverService } from './ytsaver.service';

@Controller('external')
export class ExternalController {
  constructor(
    private readonly ytsaver: YtsaverService,
    private readonly ytdlp: YtdlpService,
  ) {}

  @Get('youtube/search')
  searchYoutube(@Query('q') q: string): Promise<YoutubeSearchResultDto> {
    return this.ytdlp.search(q ?? '');
  }

  @Post('youtube/download')
  async downloadYoutube(
    @Body() body: { videoId: string },
  ): Promise<YoutubeDownloadResultDto> {
    const track: TrackDto = await this.ytdlp.download(body.videoId);
    return { track };
  }

  @Post('ytsaver/launch')
  launchYtsaver(): { ok: true } {
    this.ytsaver.launch();
    return { ok: true };
  }
}
