import { describe, expect, it, vi } from 'vitest';
import {
  WindowsOneCoreTtsEngine,
  buildOneCoreListVoicesScript,
  buildOneCoreSpeakScript,
} from '../tts/WindowsOneCoreTtsEngine.js';

const AN_VOICE = 'Microsoft An - Vietnamese (Vietnam)';

describe('WindowsOneCoreTtsEngine (Phase 13D-R4): voice enumeration', () => {
  it('parses "DisplayName|Language|Id" lines into structured voice info', async () => {
    const execFn = vi.fn().mockResolvedValue(
      [
        `${AN_VOICE}|vi-VN|{179F3D56-1B0B-42B2-A962-59B7EF59FE1B}`,
        'Microsoft Zira Desktop|en-US|TTS_MS_EN-US_ZIRA_11.0',
        '',
      ].join('\r\n')
    );
    const engine = new WindowsOneCoreTtsEngine(execFn);

    const details = await engine.listVoiceDetails();

    expect(details).toEqual([
      { displayName: AN_VOICE, language: 'vi-VN', id: '{179F3D56-1B0B-42B2-A962-59B7EF59FE1B}' },
      { displayName: 'Microsoft Zira Desktop', language: 'en-US', id: 'TTS_MS_EN-US_ZIRA_11.0' },
    ]);
  });

  it('listVoices() returns only bare display names, matching the TtsEngine contract', async () => {
    const execFn = vi.fn().mockResolvedValue(`${AN_VOICE}|vi-VN|some-id\n`);
    const engine = new WindowsOneCoreTtsEngine(execFn);

    const names = await engine.listVoices();

    expect(names).toEqual([AN_VOICE]);
  });

  it('tolerates blank lines and whitespace without throwing', async () => {
    const execFn = vi.fn().mockResolvedValue(`  \n${AN_VOICE}|vi-VN|id\n\n   \n`);
    const engine = new WindowsOneCoreTtsEngine(execFn);

    const names = await engine.listVoices();

    expect(names).toEqual([AN_VOICE]);
  });

  it('runs the enumeration via Windows PowerShell (never pwsh)', async () => {
    const execFn = vi.fn().mockResolvedValue('');
    const engine = new WindowsOneCoreTtsEngine(execFn);

    await engine.listVoices();

    expect(execFn).toHaveBeenCalledWith('powershell', expect.arrayContaining(['-NoProfile', '-Command']));
    const [, args] = execFn.mock.calls[0] as [string, string[]];
    expect(args[0]).not.toBe('pwsh');
  });
});

describe('WindowsOneCoreTtsEngine (Phase 13D-R4): voice selection', () => {
  it('speak() with a voice name asks the script to select that exact voice', async () => {
    const execFn = vi.fn().mockResolvedValue('');
    const engine = new WindowsOneCoreTtsEngine(execFn);

    await engine.speak('Đã nhận một trăm nghìn đồng.', { voice: AN_VOICE, volume: 80 });

    const [, args] = execFn.mock.calls[0] as [string, string[]];
    const script = args[2];
    expect(script).toContain(`DisplayName -eq '${AN_VOICE}'`);
  });

  it('speak() without a voice name skips voice selection (engine default voice)', async () => {
    const execFn = vi.fn().mockResolvedValue('');
    const engine = new WindowsOneCoreTtsEngine(execFn);

    await engine.speak('hello', { volume: 80 });

    const [, args] = execFn.mock.calls[0] as [string, string[]];
    expect(args[2]).not.toContain('DisplayName -eq');
  });
});

describe('WindowsOneCoreTtsEngine (Phase 13D-R4): PowerShell script safety', () => {
  const cases: Array<{ label: string; text: string }> = [
    { label: 'Vietnamese diacritics', text: 'Đã nhận một trăm nghìn đồng. Xin chào!' },
    { label: 'double quotes', text: 'Nội dung "ATIEU 1234"' },
    { label: 'apostrophe', text: "It's a test" },
    { label: 'multiple apostrophes', text: "''already doubled''" },
    { label: 'punctuation', text: 'Giá: 1.000.000đ, đã nhận? Có!' },
    { label: 'numbers/currency', text: '100,000 VND / 1.000.000₫' },
    { label: 'newline characters', text: 'line one\nline two\r\nline three' },
    { label: 'PowerShell metacharacters (must not expand)', text: '$env:PATH `whoami` $(Get-Process) @{a=1}' },
  ];

  for (const { label, text } of cases) {
    it(`escapes ${label} without breaking the single-quoted literal`, () => {
      const script = buildOneCoreSpeakScript(text, { volumePercent: 80 });

      // Every single quote that was in the original text must have been
      // doubled ('') so PowerShell treats it as a literal character, never
      // as the end of the string literal.
      const literalMatch = script.match(/SynthesizeTextToStreamAsync\('((?:[^']|'')*)'\)/);
      expect(literalMatch, `script did not contain a well-formed single-quoted literal:\n${script}`).not.toBeNull();

      // Reconstruct what PowerShell would read back from that literal
      // ('' -> ') and confirm it equals the original text with newlines
      // collapsed to spaces (the documented, intentional normalization).
      const roundTripped = literalMatch![1].replace(/''/g, "'");
      const expected = text.replace(/[\r\n]+/g, ' ');
      expect(roundTripped).toBe(expected);
    });
  }

  it('never emits a double-quoted interpolated string for the spoken text (injection surface)', () => {
    const script = buildOneCoreSpeakScript('$(Get-Process); `whoami`', { volumePercent: 80 });
    // The dangerous pattern would be the raw text embedded inside "...".
    expect(script).not.toContain('"$(Get-Process)');
    expect(script).not.toContain('"`whoami`"');
  });

  it('escapes single quotes in the voice name the same way', () => {
    const script = buildOneCoreSpeakScript('hi', { voiceName: "O'Brien's Voice", volumePercent: 80 });
    expect(script).toContain("DisplayName -eq 'O''Brien''s Voice'");
  });

  it('clamps/encodes volume as a plain number, not string-interpolated text', () => {
    const script = buildOneCoreSpeakScript('hi', { volumePercent: 100 });
    expect(script).toContain('$vol16 = [uint32]65535;');
  });

  it('list-voices script never runs the untrusted PS pattern-matching, uses no text interpolation at all', () => {
    const script = buildOneCoreListVoicesScript();
    expect(script).not.toMatch(/\$\(/);
  });
});

describe('WindowsOneCoreTtsEngine (Phase 13D-R4): error propagation', () => {
  it('speak() rejects when the underlying PowerShell process fails', async () => {
    const execFn = vi.fn().mockRejectedValue(new Error('powershell failed: OneCore voice not found: X'));
    const engine = new WindowsOneCoreTtsEngine(execFn);

    await expect(engine.speak('hi', { voice: 'X', volume: 80 })).rejects.toThrow(/OneCore voice not found/);
  });

  it('listVoices() rejects (does not silently return an empty list) when PowerShell fails', async () => {
    const execFn = vi.fn().mockRejectedValue(new Error('powershell not found'));
    const engine = new WindowsOneCoreTtsEngine(execFn);

    await expect(engine.listVoices()).rejects.toThrow(/powershell not found/);
  });
});

describe('WindowsOneCoreTtsEngine (Phase 13D-R4): completion semantics', () => {
  it('speak() does not resolve until the exec call (synthesis + blocking playback) completes', async () => {
    let resolveExec: (value: string) => void;
    const execPromise = new Promise<string>((resolve) => {
      resolveExec = resolve;
    });
    const execFn = vi.fn().mockReturnValue(execPromise);
    const engine = new WindowsOneCoreTtsEngine(execFn);

    let resolved = false;
    const speakPromise = engine.speak('hi', { volume: 80 }).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    resolveExec!('');
    await speakPromise;
    expect(resolved).toBe(true);
  });
});
