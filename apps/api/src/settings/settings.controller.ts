import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AppSettingsDto, ToolCheckResultDto, ToolId, ToolPathsStatusDto } from '@karaokej/shared';
import { SessionService } from '../session/session.service';
import { SettingsService } from './settings.service';
import { ToolCheckService } from './tool-check.service';
import { ToolPathsStatusService } from './tool-paths-status.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly session: SessionService,
    private readonly toolPathsStatus: ToolPathsStatusService,
    private readonly toolCheck: ToolCheckService,
  ) {}

  @Get()
  get(): AppSettingsDto {
    return this.settings.get();
  }

  @Get('tools')
  toolPaths(): ToolPathsStatusDto {
    return this.toolPathsStatus.status();
  }

  @Post('tools/check')
  async checkTool(@Body() body: { tool: ToolId }): Promise<ToolCheckResultDto> {
    return this.toolCheck.check(body.tool);
  }

  @Patch()
  patch(@Body() body: Partial<AppSettingsDto>): AppSettingsDto {
    const updated = this.settings.patch(body);
    this.session.broadcast();
    return updated;
  }
}
