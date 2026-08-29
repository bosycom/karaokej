import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PlaylistQueueMode } from '@karaokej/shared';
import { PlaylistsService } from './playlists.service';

@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  list() {
    return this.playlists.list();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.playlists.get(id);
  }

  @Post()
  create(@Body() body: { name?: string; description?: string | null }) {
    return this.playlists.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; description?: string | null },
  ) {
    return this.playlists.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    this.playlists.delete(id);
  }

  @Post(':id/items')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { trackId?: number },
  ) {
    if (!body?.trackId) {
      throw new BadRequestException('trackId is required');
    }
    return this.playlists.addItem(id, Number(body.trackId));
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.playlists.removeItem(id, itemId);
  }

  @Patch(':id/items/reorder')
  reorderItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ids?: number[] },
  ) {
    return this.playlists.reorderItems(id, body.ids ?? []);
  }

  @Post(':id/queue')
  loadIntoQueue(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { mode?: PlaylistQueueMode },
  ) {
    const mode = body.mode === 'append' ? 'append' : 'replace';
    return this.playlists.loadIntoQueue(id, mode);
  }
}
