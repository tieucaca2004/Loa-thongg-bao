import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BackendClient, type ConnectionStatus, type PaymentReceivedEvent } from './connection/BackendClient.js';
import { TransactionHistoryStore } from './state/TransactionHistoryStore.js';
import { AnnouncementQueue } from './tts/AnnouncementQueue.js';
import { WindowsSapiTtsEngine, NullTtsEngine, type TtsEngine } from './tts/TtsEngine.js';
import { loadSettings, saveSettings, type DesktopSettings } from './settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let settings: DesktopSettings;
let settingsPath: string;

function send(channel: string, payload: unknown) {
  mainWindow?.webContents.send(channel, payload);
}

function createTtsEngine(): TtsEngine {
  // Windows SAPI via PowerShell (project spec #8: TTS runs local on the counter machine).
  // Falls back to a no-op engine on non-Windows dev machines so the app still runs.
  if (process.platform === 'win32') return new WindowsSapiTtsEngine();
  return new NullTtsEngine();
}

/** Applies the autoStart setting to the OS (Windows: registry Run key via Electron's login-item API). */
function applyAutoStartSetting(autoStart: boolean) {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: autoStart });
  }
}

async function createWindow() {
  settingsPath = join(app.getPath('userData'), 'settings.json');
  settings = loadSettings(settingsPath);
  applyAutoStartSetting(settings.autoStart);

  const ttsEngine = createTtsEngine();
  const history = new TransactionHistoryStore();
  const queue = new AnnouncementQueue(ttsEngine, () => ({
    voice: settings.voice ?? undefined,
    volume: settings.volume,
  }));

  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
  send('settings', settings);
  send('history', history.list());

  const client = new BackendClient({
    url: settings.backendWsUrl,
    onStatusChange: (status: ConnectionStatus) => send('connection-status', status),
    onEvent: async (event: PaymentReceivedEvent) => {
      const entry = history.add(event);
      send('history', history.list());
      const result = await queue.announce(event);
      if (result.status === 'spoken') {
        history.markAnnounced(event.transactionId);
        send('history', history.list());
        send('announced', { transactionId: event.transactionId, text: result.text });
      } else if (result.status === 'failed') {
        send('tts-error', { transactionId: event.transactionId, error: result.error, entry });
      }
    },
    onError: (message: string) => send('connection-error', message),
  });
  client.connect();

  ipcMain.handle('test-speaker', async () => {
    try {
      await ttsEngine.speak('Kiểm tra loa. Xin chào.', { voice: settings.voice ?? undefined, volume: settings.volume });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('test-tts', async (_evt, text: string) => {
    try {
      await ttsEngine.speak(text || 'Đây là thông báo thử nghiệm.', {
        voice: settings.voice ?? undefined,
        volume: settings.volume,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('list-voices', async () => ttsEngine.listVoices());

  ipcMain.handle('retry-announcement', async () => {
    const result = await queue.retryLastFailed();
    return result;
  });

  ipcMain.handle('update-settings', async (_evt, partial: Partial<DesktopSettings>) => {
    settings = { ...settings, ...partial };
    saveSettings(settingsPath, settings);
    if ('autoStart' in partial) applyAutoStartSetting(settings.autoStart);
    return settings;
  });
}

// Phase 10.5 production check: a second instance at the same counter
// (double-clicked the shortcut twice, an installer relaunch, etc.) would
// otherwise open a second WebSocket connection to the backend and speak
// every transaction twice. requestSingleInstanceLock() makes the second
// launch quit immediately and focus the first window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    void createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
