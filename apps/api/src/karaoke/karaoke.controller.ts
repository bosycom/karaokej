import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { KaraokeMode, KaraokeSettingsDto, KaraokeStateDto } from '@karaokej/shared';
import { SessionService } from '../session/session.service';
import { KaraokeService } from './karaoke.service';
import { SeparationService } from './separation.service';

@Controller()
export class KaraokeController {
  constructor(
    private readonly karaoke: KaraokeService,
    private readonly separation: SeparationService,
    private readonly session: SessionService,
  ) {}

  @Get('tracks/:id/karaoke-settings')
  getSettings(@Param('id', ParseIntPipe) id: number): KaraokeSettingsDto {
    return this.karaoke.getSettings(id);
  }

  @Put('tracks/:id/karaoke-settings')
  saveSettings(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): KaraokeSettingsDto {
    const updated = this.karaoke.saveSettings(id, body);
    this.session.broadcast();
    return updated;
  }

  @Delete('tracks/:id/karaoke-settings')
  resetSettings(@Param('id', ParseIntPipe) id: number): KaraokeSettingsDto {
    const updated = this.karaoke.resetSettings(id);
    this.session.broadcast();
    return updated;
  }

  @Put('karaoke/mode')
  setMode(@Body() body: { mode?: KaraokeMode }): KaraokeStateDto {
    const mode = this.karaoke.setMode(body?.mode);
    if (mode === 'ai') {
      this.separation.ensureScheduledForCurrentQueue();
    }
    this.session.broadcast();
    return this.karaoke.getState();
  }

  @Patch('karaoke/live')
  patchLive(
    @Body() body: unknown & { trackId?: number },
  ): KaraokeStateDto {
    const updated = this.karaoke.patchLive(body, body?.trackId ?? null);
    this.session.broadcast();
    return updated;
  }

  @Get('karaoke/state')
  getState(): KaraokeStateDto {
    return this.karaoke.getState();
  }

  @Post('karaoke/tracks/:id/separate')
  separate(@Param('id', ParseIntPipe) id: number): KaraokeStateDto {
    this.separation.request(id);
    this.session.broadcast();
    return this.karaoke.getState();
  }

  @Delete('karaoke/separation')
  cancelSeparation(): KaraokeStateDto {
    this.separation.cancel();
    this.session.broadcast();
    return this.karaoke.getState();
  }
}
