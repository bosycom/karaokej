export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relative_path TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  album_artist TEXT,
  track_no INTEGER,
  duration_ms INTEGER,
  lyric_status TEXT NOT NULL DEFAULT 'missing',
  lyric_source TEXT,
  lyric_checked_at INTEGER,
  lrclib_id INTEGER,
  fingerprint TEXT,
  rating INTEGER,
  year INTEGER,
  genres TEXT,
  metadata_status TEXT NOT NULL DEFAULT 'ready',
  available INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS idx_tracks_fingerprint ON tracks(fingerprint);
CREATE INDEX IF NOT EXISTS idx_tracks_lyric_status ON tracks(lyric_status);

CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  title,
  artist,
  album,
  content='tracks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;

CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
END;

CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.id, old.title, old.artist, old.album);
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.id, new.title, new.artist, new.album);
END;

CREATE TABLE IF NOT EXISTS lyric_memory (
  fingerprint TEXT PRIMARY KEY,
  lyric_status TEXT NOT NULL,
  lyric_source TEXT,
  lyric_checked_at INTEGER,
  lrclib_id INTEGER
);

CREATE TABLE IF NOT EXISTS queue_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_position ON queue_items(position);

CREATE TABLE IF NOT EXISTS playback_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_queue_item_id INTEGER REFERENCES queue_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  position_ms INTEGER NOT NULL DEFAULT 0,
  volume REAL NOT NULL DEFAULT 1,
  player_client_id TEXT,
  seek_seq INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  kind TEXT PRIMARY KEY,
  running INTEGER NOT NULL DEFAULT 0,
  current INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_dir_stats (
  relative_path TEXT PRIMARY KEY,
  mtime_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id, position);
`;
