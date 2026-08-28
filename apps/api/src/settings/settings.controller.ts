import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AppSettingsDto } from '@karaokej/shared';
import { SessionService } from '../session/session.service';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly session: SessionService,
  ) {}

  @Get()
  get(): AppSettingsDto {
    return this.settings.get();
  }

  @Patch()
  patch(@Body() body: Partial<AppSettingsDto>): AppSettingsDto {
    const updated = this.settings.patch(body);
    this.session.broadcast();
    return updated;
  }
}
