import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DesktopSettings {
  backendWsUrl: string;
  voice: string | null;
  volume: number; // 0-100
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  backendWsUrl: 'ws://localhost:3001',
  voice: null,
  volume: 80,
};

/** Loads settings from a JSON file, falling back to defaults if missing/corrupt. */
export function loadSettings(path: string): DesktopSettings {
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(path: string, settings: DesktopSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), 'utf-8');
}
