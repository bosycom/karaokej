# Karaokej

Self-hosted local-network Karaoke appliance. NestJS indexes a mounted music folder, React plays audio in the browser and shows synchronized lyrics.

Requires **Node.js 22+** (uses the built-in `node:sqlite` driver).

## Setup

```bash
cp .env.example .env
# MUSIC_LIBRARY_PATH defaults to ./sample-music for a first run.
# Point it at your Samba mount when you are ready, e.g. /mnt/music
# Multiple libraries: comma-separated, e.g. /mnt/a/Music,/mnt/b/Karaoke
npm install
npm run dev
```

Open `http://localhost:5173` on this machine, or `http://<lan-ip>:5173` from another device.

Production:

```bash
npm run build
npm start
```

Then open `http://<host>:3000`.

## Usage

1. Scan library
2. Optionally fetch missing `.lrc` files from LRCLIB (written next to the audio files)
3. Search, queue, play
4. Open `/karaoke` for the large-type display

## Karaoke modes

- **Off** — normal playback
- **Vocal Reduction** — realtime centre-channel cancellation in the browser
- **AI Vocal Removal** — server-side Demucs separation (optional)

### AI vocal removal (optional)

Install Demucs on the machine running the API, for example:

```bash
pipx install demucs
```

The first separation run downloads model weights (~80 MB). On CPU, expect roughly 1–3 minutes per song.

Configure in `.env` (all optional):

- `DEMUCS_PATH` — CLI name or absolute path (default `demucs`)
- `DEMUCS_MODEL` — model name (default `htdemucs`)
- `DEMUCS_STEM_CACHE_PATH` — where instrumental stems are cached (default `./data/karaoke-stems`)

When AI mode is enabled, playback starts with realtime vocal reduction and automatically swaps to the instrumental stem when separation finishes, preserving playback position.
