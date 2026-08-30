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
  add(@Body() body: { trackId?: number; placement?: 'end' | 'after_current' }) {
    if (!body?.trackId) {
      return this.queue.list();
    }
    const placement = body.placement === 'after_current' ? 'after_current' : 'end';
    return this.queue.add(Number(body.trackId), placement);
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
