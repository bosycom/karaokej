import { Body, Controller, Get, Post } from '@nestjs/common';
import { PlaybackService } from './playback.service';

@Controller('playback')
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Get()
  get() {
    return this.playback.get();
  }

  @Post('play')
  play() {
    return this.playback.play();
  }

  @Post('pause')
  pause() {
    return this.playback.pause();
  }

  @Post('seek')
  seek(@Body() body: { positionMs?: number }) {
    return this.playback.seek(Number(body?.positionMs ?? 0));
  }

  @Post('volume')
  volume(@Body() body: { volume?: number }) {
    return this.playback.volume(Number(body?.volume ?? 1));
  }

  @Post('skip')
  skip() {
    return this.playback.skip();
  }

  @Post('ended')
  ended(@Body() body: { clientId?: string }) {
    return this.playback.ended(body?.clientId);
  }

  @Post('checkpoint')
  checkpoint(@Body() body: { positionMs?: number; clientId?: string }) {
    return this.playback.checkpoint(Number(body?.positionMs ?? 0), body?.clientId);
  }

  @Post('play-item')
  playItem(@Body() body: { queueItemId?: number }) {
    return this.playback.playQueueItem(Number(body?.queueItemId));
  }

  @Post('claim')
  claim(@Body() body: { clientId?: string }) {
    if (!body?.clientId) {
      return this.playback.get();
    }
    return this.playback.claimPlayer(body.clientId);
  }
}
