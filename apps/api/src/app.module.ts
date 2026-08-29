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
import { SettingsService } from './settings/settings.service';
import { SettingsController } from './settings/settings.controller';
import { RatingService } from './rating/rating.service';
import { TrackMetadataService } from './metadata/track-metadata.service';
import { PlaylistsController } from './playlists/playlists.controller';
import { PlaylistsService } from './playlists/playlists.service';
import { ExternalController } from './external/external.controller';
import { YtsaverService } from './external/ytsaver.service';
import { YtdlpService } from './external/ytdlp.service';
import { KaraokeController } from './karaoke/karaoke.controller';
import { KaraokeService } from './karaoke/karaoke.service';
import { SeparationService } from './karaoke/separation.service';

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
    SettingsController,
    PlaylistsController,
    ExternalController,
    KaraokeController,
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
    SettingsService,
    RatingService,
    TrackMetadataService,
    PlaylistsService,
    YtsaverService,
    YtdlpService,
    KaraokeService,
    SeparationService,
  ],
})
export class AppModule {}
