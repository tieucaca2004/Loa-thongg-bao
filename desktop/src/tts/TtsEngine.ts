/** Abstraction over the platform TTS engine, so the queue/dedupe logic is testable without real audio hardware. */
export interface TtsEngine {
  /** Speaks `text` using `voice` (engine-specific id/name) at `volume` (0-100). Resolves/rejects when done. */
  speak(text: string, options: { voice?: string; volume: number }): Promise<void>;
  /** Lists available voice names, e.g. from Windows SAPI. */
  listVoices(): Promise<string[]>;
}

/**
 * Windows SAPI-backed engine, implemented by shelling out to PowerShell's
 * System.Speech.Synthesis API. This runs local on the desktop machine (per
 * project spec #8) — no cloud TTS dependency.
 */
export class WindowsSapiTtsEngine implements TtsEngine {
  constructor(private readonly execFn: ExecFn = defaultExec) {}

  async speak(text: string, options: { voice?: string; volume: number }): Promise<void> {
    const escaped = text.replace(/"/g, '`"').replace(/[\r\n]+/g, ' ');
    const voiceLine = options.voice ? `$s.SelectVoice("${options.voice.replace(/"/g, '`"')}");` : '';
    const volume = Math.max(0, Math.min(100, Math.round(options.volume)));
    const script = [
      'Add-Type -AssemblyName System.Speech;',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      voiceLine,
      `$s.Volume = ${volume};`,
      `$s.Speak("${escaped}");`,
    ].join(' ');

    await this.execFn('powershell', ['-NoProfile', '-Command', script]);
  }

  async listVoices(): Promise<string[]> {
    const script =
      'Add-Type -AssemblyName System.Speech; ' +
      '(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ' +
      'ForEach-Object { $_.VoiceInfo.Name }';
    const output = await this.execFn('powershell', ['-NoProfile', '-Command', script]);
    return output
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
}

type ExecFn = (command: string, args: string[]) => Promise<string>;

async function defaultExec(command: string, args: string[]): Promise<string> {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${command} failed: ${stderr || err.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/** Test/fallback engine that does nothing but succeed — used when no TTS backend is available. */
export class NullTtsEngine implements TtsEngine {
  async speak(): Promise<void> {
    /* no-op */
  }
  async listVoices(): Promise<string[]> {
    return [];
  }
}
