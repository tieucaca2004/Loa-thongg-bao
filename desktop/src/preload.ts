import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('atieu', {
  onConnectionStatus: (cb: (status: string) => void) =>
    ipcRenderer.on('connection-status', (_e, status) => cb(status)),
  onConnectionError: (cb: (message: string) => void) =>
    ipcRenderer.on('connection-error', (_e, message) => cb(message)),
  onHistory: (cb: (entries: unknown[]) => void) => ipcRenderer.on('history', (_e, entries) => cb(entries)),
  onAnnounced: (cb: (payload: { transactionId: string; text: string }) => void) =>
    ipcRenderer.on('announced', (_e, payload) => cb(payload)),
  onTtsError: (cb: (payload: { transactionId: string; error: string }) => void) =>
    ipcRenderer.on('tts-error', (_e, payload) => cb(payload)),
  onSettings: (cb: (settings: unknown) => void) => ipcRenderer.on('settings', (_e, settings) => cb(settings)),

  testSpeaker: () => ipcRenderer.invoke('test-speaker'),
  testTts: (text: string) => ipcRenderer.invoke('test-tts', text),
  listVoices: () => ipcRenderer.invoke('list-voices'),
  retryAnnouncement: () => ipcRenderer.invoke('retry-announcement'),
  updateSettings: (partial: Record<string, unknown>) => ipcRenderer.invoke('update-settings', partial),
});
