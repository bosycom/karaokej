import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { stat } from 'node:fs/promises';
import {
  ImportTagsResultDto,
  ManagedTagDto,
  MAX_MANAGED_TAGS,
  MAX_TAGS_PER_SONG,
  parseTagName,
  TagFileFailureDto,
  TagMutationResultDto,
  TagRenameResultDto,
  tagKey,
  tagNameError,
  TrackDto,
  TrackTagStateDto,
  UnmanagedTagsDto,
} from '@karaokej/shared';
import { AppConfigService } from '../config/app-config.service';
import { DbService } from '../db/db.service';
import { TrackRow } from '../db/types';
import { LibraryService } from '../library/library.service';
import { readMoodValuesFromFile } from '../library/scan-metadata';
import { writeMoodsToFile } from '../rating/mood-tags';
import { SessionService } from '../session/session.service';
import { replaceTrackMoodCache } from './tag-cache';
import { partitionMoodValues } from './mood-values';

interface ManagedRow {
  id: number;
  name: string;
  name_key: string;
}

@Injectable()
export class TagsService {
  constructor(
    private readonly db: DbService,
    private readonly config: AppConfigService,
    private readonly library: LibraryService,
    private readonly session: SessionService,
  ) {}

  list(): { tags: ManagedTagDto[] } {
    const rows = this.db.raw
      .prepare(
        `SELECT mt.id, mt.name,
           (SELECT COUNT(*) FROM track_tag_names ttn WHERE ttn.name_key = mt.name_key) AS song_count
         FROM managed_tags mt
         ORDER BY mt.name COLLATE NOCASE, mt.id`,
      )
      .all() as Array<{ id: number; name: string; song_count: number }>;
    return {
      tags: rows.map((row) => ({
        id: row.id,
        name: row.name,
        songCount: row.song_count,
      })),
    };
  }

  create(raw: unknown): ManagedTagDto {
    const parsed = this.requireName(raw);
    if (this.findByKey(parsed.key)) {
      throw new BadRequestException(`“${parsed.name}” already exists.`);
    }
    this.assertRoom(1);
    return this.insertManaged(parsed.name, parsed.key);
  }

  unmanaged(): UnmanagedTagsDto {
    const rows = this.db.raw
      .prepare(
        `SELECT MIN(ttn.name) AS name
         FROM track_tag_names ttn
         WHERE NOT EXISTS (
           SELECT 1 FROM managed_tags mt WHERE mt.name_key = ttn.name_key
         )
         GROUP BY ttn.name_key
         ORDER BY name COLLATE NOCASE`,
      )
      .all() as Array<{ name: string }>;
    return { names: rows.map((row) => row.name) };
  }

  importNames(raw: unknown): ImportTagsResultDto {
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
      throw new BadRequestException('names must be a list of strings');
    }
    const imported: string[] = [];
    const skipped: string[] = [];
    for (const item of raw) {
      const parsed = parseTagName(item);
      if (!parsed) {
        skipped.push(item);
        continue;
      }
      if (this.findByKey(parsed.key)) {
        skipped.push(parsed.name);
        continue;
      }
      const embedded = this.db.raw
        .prepare(
          `SELECT name FROM track_tag_names WHERE name_key = ? ORDER BY name COLLATE NOCASE LIMIT 1`,
        )
        .get(parsed.key) as { name: string } | undefined;
      if (!embedded) {
        skipped.push(parsed.name);
        continue;
      }
      if (this.countManaged() >= MAX_MANAGED_TAGS) {
        skipped.push(embedded.name);
        continue;
      }
      this.insertManaged(embedded.name, parsed.key);
      imported.push(embedded.name);
    }
    if (imported.length > 0) {
      this.session.broadcast();
    }
    return { imported, skipped };
  }

  async trackState(trackId: number): Promise<TrackTagStateDto> {
    const track = this.requireTrack(trackId);
    const values = await this.readValues(track);
    const partitioned = partitionMoodValues(values);
    const managed: string[] = [];
    const embedded: string[] = [];
    for (const name of partitioned.valid) {
      const parsed = parseTagName(name);
      if (!parsed) {
        continue;
      }
      const row = this.findByKey(parsed.key);
      if (row) {
        managed.push(row.name);
      } else {
        embedded.push(parsed.name);
      }
    }
    return { managed, embedded, extraCount: partitioned.extra.length };
  }

  async assign(trackId: number, raw: unknown): Promise<TrackDto> {
    const track = this.requireTrack(trackId);
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
      throw new BadRequestException('names must be a list of strings');
    }
    const wanted: Array<{ name: string; key: string }> = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const parsed = parseTagName(item);
      if (!parsed) {
        throw new BadRequestException(tagNameError(item) ?? 'Invalid tag name.');
      }
      if (seen.has(parsed.key)) {
        continue;
      }
      seen.add(parsed.key);
      wanted.push(parsed);
    }
    const partitioned = partitionMoodValues(await this.readValues(track));
    const embeddedKeys = new Set(
      partitioned.valid
        .map((name) => parseTagName(name))
        .filter((parsed): parsed is { name: string; key: string } => parsed != null)
        .filter((parsed) => !this.findByKey(parsed.key))
        .map((parsed) => parsed.key),
    );
    const canonical: string[] = [];
    for (const name of wanted) {
      const managed = this.findByKey(name.key);
      if (managed) {
        canonical.push(managed.name);
        continue;
      }
      if (embeddedKeys.has(name.key)) {
        canonical.push(name.name);
        continue;
      }
      throw new BadRequestException(`Unknown tag “${name.name}”.`);
    }
    if (canonical.length + partitioned.extra.length > MAX_TAGS_PER_SONG) {
      throw new BadRequestException(
        `A song can have at most ${MAX_TAGS_PER_SONG} mood names.`,
      );
    }
    await this.writeValues(track, [...canonical, ...partitioned.extra]);
    this.session.broadcast();
    const dto = this.library.getTrackDto(trackId);
    if (!dto) {
      throw new NotFoundException('Track not found');
    }
    return dto;
  }

  async rename(id: number, raw: unknown, merge: boolean): Promise<TagRenameResultDto> {
    const tag = this.requireManaged(id);
    const parsed = this.requireName(raw);
    const existing = this.findByKey(parsed.key);
    const collision = existing != null && existing.id !== tag.id;
    if (!collision && parsed.name === tag.name) {
      return {
        conflict: false,
        result: { tag: this.toDto(tag.id), failures: [] },
      };
    }
    if (collision && !merge) {
      return {
        conflict: true,
        existingName: existing.name,
        songCount: this.songCount(tag.name_key),
      };
    }
    const targetName = collision ? existing.name : parsed.name;
    const targetKey = collision ? existing.name_key : parsed.key;
    if (!collision && targetKey !== tag.name_key) {
      this.assertRoom(0);
    }
    const failures = await this.rewriteKey(tag.name_key, targetName);
    if (failures.length === 0) {
      if (collision) {
        this.db.raw.prepare(`DELETE FROM managed_tags WHERE id = ?`).run(tag.id);
      } else if (targetName !== tag.name || targetKey !== tag.name_key) {
        this.db.raw
          .prepare(
            `UPDATE managed_tags SET name = ?, name_key = ?, updated_at = ? WHERE id = ?`,
          )
          .run(targetName, targetKey, Date.now(), tag.id);
      }
    } else if (!collision && targetKey !== tag.name_key && this.songCount(targetKey) > 0) {
      if (!this.findByKey(targetKey) && this.countManaged() < MAX_MANAGED_TAGS) {
        this.insertManaged(targetName, targetKey);
      }
    }
    this.session.broadcast();
    const remaining = this.findByKey(collision && failures.length === 0 ? targetKey : tag.name_key);
    const shown = remaining ?? (failures.length === 0 ? this.findByKey(targetKey) : null);
    return {
      conflict: false,
      result: {
        tag: shown ? this.toDto(shown.id) : null,
        failures,
      },
    };
  }

  async remove(id: number): Promise<TagMutationResultDto> {
    const tag = this.requireManaged(id);
    const failures = await this.rewriteKey(tag.name_key, null);
    if (failures.length === 0) {
      this.db.raw.prepare(`DELETE FROM managed_tags WHERE id = ?`).run(tag.id);
    }
    this.session.broadcast();
    return {
      tag: failures.length === 0 ? null : this.toDto(tag.id),
      failures,
    };
  }

  private async rewriteKey(fromKey: string, replacement: string | null): Promise<TagFileFailureDto[]> {
    const tracks = this.db.raw
      .prepare(
        `SELECT t.*
         FROM tracks t
         JOIN track_tag_names ttn ON ttn.track_id = t.id
         WHERE ttn.name_key = ?`,
      )
      .all(fromKey) as TrackRow[];
    const failures: TagFileFailureDto[] = [];
    for (const track of tracks) {
      try {
        const values = await this.readValues(track);
        const next = replacement == null
          ? values.filter((value) => parseTagName(value)?.key !== fromKey)
          : replaceMoodName(values, fromKey, replacement);
        await this.writeValues(track, next);
      } catch (err) {
        failures.push({
          trackId: track.id,
          path: track.relative_path,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return failures;
  }

  private async readValues(track: TrackRow): Promise<string[]> {
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute) {
      throw new BadRequestException('Track path is outside the music library');
    }
    return readMoodValuesFromFile(
      absolute,
      track.relative_path,
      this.config.scanFsTimeoutMs,
    );
  }

  private async writeValues(track: TrackRow, values: string[]): Promise<void> {
    const absolute = this.config.resolveUnderLibrary(track.relative_path);
    if (!absolute) {
      throw new BadRequestException('Track path is outside the music library');
    }
    await writeMoodsToFile(absolute, track.format, values);
    const info = await stat(absolute);
    this.db.raw
      .prepare(
        `UPDATE tracks SET size_bytes = ?, mtime_ms = ?, updated_at = ? WHERE id = ?`,
      )
      .run(info.size, Math.floor(info.mtimeMs), Date.now(), track.id);
    const partitioned = partitionMoodValues(values);
    replaceTrackMoodCache(this.db.raw, track.id, partitioned.valid, partitioned.extra);
  }

  private requireTrack(trackId: number): TrackRow {
    const track = this.library.getTrack(trackId);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    return track;
  }

  private requireName(raw: unknown): { name: string; key: string } {
    if (typeof raw !== 'string') {
      throw new BadRequestException('Enter a tag name.');
    }
    const parsed = parseTagName(raw);
    if (!parsed) {
      throw new BadRequestException(tagNameError(raw) ?? 'Invalid tag name.');
    }
    return parsed;
  }

  private requireManaged(id: number): ManagedRow {
    const row = this.db.raw
      .prepare(`SELECT id, name, name_key FROM managed_tags WHERE id = ?`)
      .get(id) as ManagedRow | undefined;
    if (!row) {
      throw new NotFoundException('Tag not found');
    }
    return row;
  }

  private findByKey(key: string): ManagedRow | undefined {
    return this.db.raw
      .prepare(`SELECT id, name, name_key FROM managed_tags WHERE name_key = ?`)
      .get(key) as ManagedRow | undefined;
  }

  private countManaged(): number {
    const row = this.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM managed_tags`)
      .get() as { n: number };
    return row.n;
  }

  private songCount(key: string): number {
    const row = this.db.raw
      .prepare(`SELECT COUNT(*) AS n FROM track_tag_names WHERE name_key = ?`)
      .get(key) as { n: number };
    return row.n;
  }

  private assertRoom(adding: number): void {
    if (this.countManaged() + adding > MAX_MANAGED_TAGS) {
      throw new BadRequestException(
        `The tag list is limited to ${MAX_MANAGED_TAGS} tags.`,
      );
    }
  }

  private insertManaged(name: string, key: string): ManagedTagDto {
    const now = Date.now();
    const result = this.db.raw
      .prepare(
        `INSERT INTO managed_tags (name, name_key, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(name, key, now, now);
    const id = Number((result as { lastInsertRowid: bigint }).lastInsertRowid);
    return this.toDto(id);
  }

  private toDto(id: number): ManagedTagDto {
    const row = this.requireManaged(id);
    return { id: row.id, name: row.name, songCount: this.songCount(row.name_key) };
  }
}

function replaceMoodName(values: string[], fromKey: string, toName: string): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  const toKey = tagKey(toName);
  for (const value of values) {
    const parsed = parseTagName(value);
    if (parsed?.key === fromKey) {
      if (!seen.has(toKey)) {
        next.push(toName);
        seen.add(toKey);
      }
      continue;
    }
    if (parsed) {
      if (seen.has(parsed.key)) {
        continue;
      }
      seen.add(parsed.key);
    }
    next.push(value);
  }
  return next;
}
