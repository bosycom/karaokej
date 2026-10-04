import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const API_PORT = 3000;
const API_HOST = '127.0.0.1';

let apiProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function karaokeRoot(): string {
  return dirname(process.execPath);
}

function packagedAppRoot(): string {
  return join(process.resourcesPath, 'karaokej-server');
}

function resourceBin(name: string): string {
  return join(process.resourcesPath, 'bin', name);
}

function buildApiEnv(): NodeJS.ProcessEnv {
  const root = karaokeRoot();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    KARAOKEJ_ROOT: root,
    HOST: '0.0.0.0',
    PORT: String(API_PORT),
    FFMPEG_PATH: resourceBin('ffmpeg.exe'),
    FFPROBE_PATH: resourceBin('ffprobe.exe'),
    YTDLP_PATH: resourceBin('yt-dlp.exe'),
    YTDLP_NODE_PATH: process.execPath,
    YTDLP_SELF_UPDATE: '1',
    DEMUCS_EXTRA_ARGS: '--device cpu',
  };

  const demucsPython = join(root, 'demucs-runtime', 'python.exe');
  if (existsSync(demucsPython)) {
    env.DEMUCS_PATH = demucsPython;
    env.DEMUCS_PYTHON_MODULE = 'demucs';
  }

  return env;
}

function apiEntryPath(): string {
  return join(packagedAppRoot(), 'apps', 'api', 'dist', 'main.js');
}

async function waitForApi(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://${API_HOST}:${API_PORT}/api/library/status`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`API did not start within ${timeoutMs / 1000}s`);
}

function startApi(): void {
  const entry = apiEntryPath();
  if (!existsSync(entry)) {
    throw new Error(`API entry missing: ${entry}`);
  }
  const child = spawn(process.execPath, [entry], {
    cwd: packagedAppRoot(),
    env: buildApiEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess = child;
  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[api] ${chunk}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[api] ${chunk}`);
  });
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`API exited with code ${code} signal ${signal ?? ''}`);
    }
    apiProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('karaokej:api-exited', { code, signal });
    }
  });
}

function stopApi(): void {
  if (!apiProcess) {
    return;
  }
  apiProcess.kill('SIGTERM');
  apiProcess = null;
}

function windowIconPath(): string | undefined {
  const candidates = [
    join(__dirname, '..', 'build', 'icon.png'),
    join(process.resourcesPath, 'icon.png'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  return undefined;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: windowIconPath(),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  void mainWindow.loadURL(`http://${API_HOST}:${API_PORT}/`);
}

async function boot(): Promise<void> {
  startApi();
  await waitForApi();
  createWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    ipcMain.handle('karaokej:pick-library-folders', async () => {
      const result =
        mainWindow && !mainWindow.isDestroyed()
          ? await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory', 'multiSelections'],
            })
          : await dialog.showOpenDialog({
              properties: ['openDirectory', 'multiSelections'],
            });
      if (result.canceled) {
        return [] as string[];
      }
      return result.filePaths;
    });

    void boot().catch((err) => {
      console.error(err);
      dialog.showErrorBox(
        'Karaokej failed to start',
        err instanceof Error ? err.message : String(err),
      );
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    stopApi();
    app.quit();
  });

  app.on('before-quit', () => {
    stopApi();
  });
}
