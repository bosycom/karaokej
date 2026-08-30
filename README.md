# Karaokej

Self-hosted karaoke for your local network. A NestJS API indexes a music folder; a React app plays audio in the browser and shows synchronized lyrics.

## Features

- Scan one or more music libraries into a local SQLite catalogue
- Search, queue, and play tracks from any device on the LAN
- Fetch missing `.lrc` lyrics from LRCLIB and keep them next to the audio files
- Large-type karaoke display at `/karaoke`
- Karaoke modes: normal playback, realtime vocal reduction, and optional AI vocal removal (Demucs)
- Playlists, ratings, and metadata edits written back to the files

## Install and run

Requires **Node.js 22+**.

```bash
cp .env.example .env
npm install
npm run dev
```

`MUSIC_LIBRARY_PATH` defaults to `./sample-music`. Point it at your music folder (comma-separated for multiple libraries), then open `http://localhost:5173`.

Scan the library, optionally fetch lyrics, search and queue tracks, and open `/karaoke` for the singer display.

Production:

```bash
npm run build
npm start
```

Then open `http://<host>:3000`.

## Dependencies

- **Node.js 22+** — runtime; the API uses the built-in `node:sqlite` driver
- **NestJS** — API, library scan, and WebSocket session
- **React** and **Vite** — web player and karaoke UI
- **LRCLIB** — optional lyric downloads
- **Demucs** — optional AI vocal removal (`pipx install demucs`)
