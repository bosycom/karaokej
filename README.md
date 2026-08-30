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

Open `http://localhost:5173` on this machine, or `http://<lan-ip>:5173` from another device on the same network.

Production:

```bash
npm run build
npm start
```

Then open `http://<host>:3000`.

## WSL network library (`/mnt/a`)

If `MUSIC_LIBRARY_PATH` points at a Windows mapped drive mounted in WSL (e.g. `A:\` → `\\192.168.50.1\Audio` at `/mnt/a`), tag writes never rename or unlink the audio file. **drvfs** on mapped network drives rejects rename-over-existing while another handle is open, and the failed replace can leave the destination pending deletion, which loses the file once the last handle closes.

Instead, rating and metadata writes take a verified sibling backup (`<name>.karaokej-bak`), overwrite the file in place, check the result, and only then drop the backup. A backup left behind after a crash holds the original content. Tag edits are also kept size-preserving where possible (padded ID3v2 tag area, FLAC padding block, fixed-length `OpusTags` packet), so the audio frames never move and a track can be re-rated while it is playing without interrupting playback.

For best compatibility long term, mount the SMB share directly with CIFS instead of drvfs:

```bash
sudo apt-get install -y cifs-utils
sudo mkdir -p /etc/karaokej
sudo install -m 600 /dev/stdin /etc/karaokej/audio.credentials <<'EOF'
username=YOUR_USER
password=YOUR_PASSWORD
EOF
sudo install -m 755 scripts/mount-windows-audio.sh /usr/local/sbin/mount-windows-audio.sh
```

The script prefers CIFS when `/etc/karaokej/audio.credentials` exists, otherwise falls back to `A:\` via drvfs. An active `/etc/fstab` line for `A:\` is intentionally commented out because mapped drives are not visible at WSL boot; use `[boot] command=` in `/etc/wsl.conf` instead.

## Access from other devices (WSL2)

Vite and the API already listen on all interfaces (`0.0.0.0`). In dev, the web app proxies `/api` and `/ws` to the API inside WSL, so other devices only need **port 5173**.

### Mirrored networking (recommended on Windows 11 22H2+)

If `%UserProfile%\.wslconfig` already contains:

```ini
[wsl2]
networkingMode=mirrored
```

then WSL shares your Windows LAN IP. You do **not** need `netsh portproxy`. After changing `.wslconfig`, run `wsl --shutdown` once and reopen your distro.

Verify inside WSL that the LAN IP matches Windows (e.g. `192.168.50.55`):

```bash
hostname -I
```

Start the dev server, then open `http://<windows-lan-ip>:5173` from your tablet (e.g. `http://192.168.50.55:5173`).

If the tablet still cannot connect, allow inbound TCP 5173 in Windows Firewall (elevated PowerShell):

```powershell
netsh advfirewall firewall add rule name="Karaokej Vite 5173" dir=in action=allow protocol=TCP localport=5173
```

On some Windows builds you may also need a Hyper-V firewall rule for WSL; if Defender alone does not help, search for "WSL mirrored networking firewall" in Microsoft docs for your Windows version.

For production (`npm start`), allow **port 3000** instead of 5173.

### Port forwarding (default WSL2 NAT only)

Skip this section if mirrored networking is enabled.

On default NAT networking, `localhost:5173` works on the Windows PC, but other LAN devices hit the Windows LAN IP and will **not** reach Vite until you publish the port from Windows into WSL.

Run in **elevated PowerShell** on the Windows host. Get the current WSL IPv4 first (it can change after `wsl --shutdown`):

```powershell
wsl hostname -I
```

Forward port 5173 and allow it through the firewall:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=5173 connectaddress=<WSL_IP> connectport=5173
netsh advfirewall firewall add rule name="Karaokej Vite 5173" dir=in action=allow protocol=TCP localport=5173
```

On your tablet or phone, open `http://<windows-lan-ip>:5173` (e.g. `http://192.168.50.55:5173`).

Useful checks:

- From Windows: `netsh interface portproxy show all`
- From WSL: `ss -ltn | grep 5173` (or `curl -sI http://127.0.0.1:5173`)

Remove the forward later:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=5173
```

Re-run the `portproxy add` command after WSL restarts if the WSL IP changed.

For production (`npm start`), use the same pattern on **port 3000** instead of 5173.

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
