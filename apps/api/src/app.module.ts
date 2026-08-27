import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AppConfigService } from './config/app-config.service';
import { DbService } from './db/db.service';
import { SessionGateway } from './session/session.gateway';
import { SessionService } from './session/session.service';
import { LibraryService } from './library/library.service';
import { LibraryController } from './library/library.controller';
import { TracksController } from './tracks/tracks.controller';
import { QueueController } from './queue/queue.controller';
import { PlaybackController } from './playback/playback.controller';
import { SessionController } from './session/session.controller';
import { PlaybackService } from './playback/playback.service';
import { QueueService } from './queue/queue.service';
import { LyricsService } from './lyrics/lyrics.service';
import { LrclibClient } from './lyrics/lrclib.client';
import { StreamService } from './stream/stream.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '../../../.env'),
        join(process.cwd(), '.env'),
        join(process.cwd(), '../../.env'),
      ],
    }),
  ],
  controllers: [
    LibraryController,
    TracksController,
    QueueController,
    PlaybackController,
    SessionController,
  ],
  providers: [
    AppConfigService,
    DbService,
    SessionService,
    SessionGateway,
    LibraryService,
    QueueService,
    PlaybackService,
    LyricsService,
    LrclibClient,
    StreamService,
  ],
})
export class AppModule {}
