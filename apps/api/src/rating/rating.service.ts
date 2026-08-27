import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { TrackDto } from '@karaokej/shared';
import { AppConfigService } from '../config/app-config.service';
import { DbService } from '../db/db.service';
import { trackToDto } from '../db/types';
import { LibraryService } from '../library/library.service';
import { SessionService } from '../session/session.service';
import { isRating } from './rating-scale';
import { writeRatingToFile } from './rating-tags';

@Injectable()
export class RatingService {
  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
    private readonly library: LibraryService,
    private readonly session: SessionService,
  ) {}

  async setRating(trackId: number, rating: unknown): Promise<TrackDto> {
    if (!isRating(rating)) {
      throw new BadRequestException('rating must be an integer from 0 to 10');
    }
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute) {
      throw new BadRequestException('Track path is outside the music library');
    }

    await writeRatingToFile(absolute, track.format, rating);
    const info = await stat(absolute);
    this.db.raw
      .prepare(
        `UPDATE tracks
         SET rating = ?, size_bytes = ?, mtime_ms = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        rating,
        info.size,
        Math.floor(info.mtimeMs),
        Date.now(),
        trackId,
      );
    this.session.broadcast();
    const updated = this.library.getTrack(trackId);
    if (!updated) {
      throw new NotFoundException('Track not found');
    }
    return trackToDto(updated);
  }
}
