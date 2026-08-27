import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
  add(@Body() body: { trackId?: number }) {
    if (!body?.trackId) {
      return this.queue.list();
    }
    return this.queue.add(Number(body.trackId));
  }

  @Patch('reorder')
  reorder(@Body() body: { ids?: number[] }) {
    return this.queue.reorder(body.ids ?? []);
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
