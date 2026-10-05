import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { TagsService } from './tags.service';

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list() {
    return this.tags.list();
  }

  @Get('unmanaged')
  unmanaged() {
    return this.tags.unmanaged();
  }

  @Post()
  create(@Body() body: { name?: unknown }) {
    return this.tags.create(body?.name);
  }

  @Post('import')
  importNames(@Body() body: { names?: unknown }) {
    return this.tags.importNames(body?.names);
  }

  @Post(':id/rename')
  rename(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: unknown; merge?: unknown },
  ) {
    return this.tags.rename(id, body?.name, body?.merge === true);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tags.remove(id);
  }
}
