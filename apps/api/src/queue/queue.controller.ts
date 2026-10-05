import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get()
  list() {
    return this.queue.list();
  }

  @Post()
  add(
    @Body()
    body: {
      trackId?: number;
      trackIds?: number[];
      placement?: 'end' | 'after_current';
      beforeId?: number;
    },
  ) {
    const beforeId =
      body.beforeId != null && Number.isFinite(Number(body.beforeId))
        ? Number(body.beforeId)
        : undefined;
    const placement = body.placement === 'after_current' ? 'after_current' : 'end';
    const trackIds =
      body.trackIds?.filter((id) => Number.isFinite(Number(id))).map(Number) ?? [];
    if (trackIds.length > 0) {
      return this.queue.addTracks(trackIds, placement, beforeId);
    }
    if (!body?.trackId) {
      return this.queue.list();
    }
    return this.queue.add(Number(body.trackId), placement, beforeId);
  }

  @Patch('reorder')
  reorder(@Body() body: { ids?: number[] }) {
    return this.queue.reorder(body.ids ?? []);
  }

  @Post('shuffle')
  shuffle() {
    return this.queue.shuffle();
  }

  @Delete()
  clear(@Query('mode') mode?: string) {
    if (mode === 'except_current') {
      return this.queue.clearExceptCurrent();
    }
    if (mode === 'before_current') {
      return this.queue.clearBeforeCurrent();
    }
    return this.queue.clear();
  }

  @Post(':id/move')
  move(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { direction?: 'up' | 'down' },
  ) {
    return this.queue.move(id, body.direction === 'down' ? 'down' : 'up');
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.queue.remove(id);
  }
}
