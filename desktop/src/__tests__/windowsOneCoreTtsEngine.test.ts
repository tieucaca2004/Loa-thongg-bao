import { describe, expect, it, vi } from 'vitest';
import {
  WindowsOneCoreTtsEngine,
  buildOneCoreListVoicesScript,
  buildOneCoreSpeakScript,
  ONECORE_ALL_VOICES,
} from '../tts/WindowsOneCoreTtsEngine.js';
import { WindowsTtsRouter } from '../tts/WindowsTtsRouter.js';

const AN_VOICE = 'Microsoft An - Vietnamese (Vietnam)';

// Real `buildOneCoreListVoicesScript()` output captured on native Windows 10
// 19045 during Phase 13D-R5/R6: WinRT DisplayName is "Microsoft An", the
// "... - Vietnamese (Vietnam)" form is its Description.
const TOKENS = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens';
const AN_ID = `${TOKENS}\\MSTTS_V110_viVN_An`;
const REAL_WIN10_VOICE_OUTPUT = [
  `Microsoft David|en-US|Microsoft David - English (United States)|${TOKENS}\\MSTTS_V110_enUS_DavidM`,
  `Microsoft Zira|en-US|Microsoft Zira - English (United States)|${TOKENS}\\MSTTS_V110_enUS_ZiraM`,
  `Microsoft An|vi-VN|${AN_VOICE}|${AN_ID}`,
  `Microsoft Mark|en-US|Microsoft Mark - English (United States)|${TOKENS}\\MSTTS_V110_enUS_MarkM`,
  '',
].join('\r\n');

describe('WindowsOneCoreTtsEngine (Phase 13D-R4): voice enumeration', () => {
  it('parses "DisplayName|Language|Description|Id" lines into structured voice info', async () => {
    const execFn = vi.fn().mockResolvedValue(REAL_WIN10_VOICE_OUTPUT);
    const engine = new WindowsOneCoreTtsEngine(execFn);

    const details = await engine.listVoiceDetails();

    expect(details).toHaveLength(4);
    expect(details[2]).toEqual({ displayName: 'Microsoft An', language: 'vi-VN', description: AN_VOICE, id: AN_ID });
    expect(details[0]).toEqual({
      displayName: 'Microsoft David',
      language: 'en-US',
      description: 'Microsoft David - English (United States)',
      id: `${TOKENS}\\MSTTS_V110_enUS_DavidM`,
    });
  });

  it('listVoices() returns the WinRT Description names, matching the TtsEngine contract', async () => {
    const execFn = vi.fn().mockResolvedValue(REAL_WIN10_VOICE_OUTPUT);
    const engine = new WindowsOneCoreTtsEngine(execFn);

    const names = await engine.listVoices();

    expect(names).toEqual([
      'Microsoft David - English (United States)',
      'Microsoft Zira - English (United States)',
      AN_VOICE,
      'Microsoft Mark - English (United States)',
    ]);
  });

  it('listVoices() falls back to DisplayName when a voice has no Description', async () => {
    const execFn = vi.fn().mockResolvedValue('Microsoft An|vi-VN||some-id\n');
    const engine = new WindowsOneCoreTtsEngine(execFn);

    expect(await engine.listVoices()).toEqual(['Microsoft An']);
  });

  it('tolerates blank lines and whitespace without throwing', async () => {
    const execFn = vi.fn().mockResolvedValue(`  \nMicrosoft An|vi-VN|${AN_VOICE}|id\n\n   \n`);
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
    expect(script).toContain(`$requestedVoice = '${AN_VOICE}';`);
  });

  it('speak() without a voice name skips voice selection (engine default voice)', async () => {
    const execFn = vi.fn().mockResolvedValue('');
    const engine = new WindowsOneCoreTtsEngine(execFn);

    await engine.speak('hello', { volume: 80 });

    const [, args] = execFn.mock.calls[0] as [string, string[]];
    expect(args[2]).not.toContain('$requestedVoice');
    expect(args[2]).not.toContain('$synth.Voice =');
  });
});

describe('WindowsOneCoreTtsEngine (Phase 13D-R6): static AllVoices access (R5 defect #1)', () => {
  const STATIC_ACCESS = '[Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices';

  it('the enumeration script reads AllVoices statically, never from an instance', () => {
    const script = buildOneCoreListVoicesScript();
    expect(ONECORE_ALL_VOICES).toBe(STATIC_ACCESS);
    expect(script).toContain(`foreach ($v in ${STATIC_ACCESS})`);
    expect(script).not.toMatch(/\$synth\.AllVoices/);
  });

  it('the enumeration script emits DisplayName, Language, Description and Id', () => {
    expect(buildOneCoreListVoicesScript()).toContain(
      "$v.DisplayName + '|' + $v.Language + '|' + $v.Description + '|' + $v.Id"
    );
  });

  it('the speak script selects the voice from the static AllVoices, never from an instance', () => {
    const script = buildOneCoreSpeakScript('Xin chào', { voiceName: AN_VOICE, volumePercent: 80 });
    expect(script).toContain(`$allVoices = @(${STATIC_ACCESS});`);
    expect(script).not.toMatch(/\$synth\.AllVoices/);
  });
});

describe('WindowsOneCoreTtsEngine (Phase 13D-R6): Vietnamese voice identity (R5 defect #2)', () => {
  const script = buildOneCoreSpeakScript('Xin chào', { voiceName: AN_VOICE, volumePercent: 80 });

  it('matches the requested voice by exact Id, then Description, then DisplayName', () => {
    const idIdx = script.indexOf('$_.Id -eq $requestedVoice');
    const descIdx = script.indexOf('$_.Description -eq $requestedVoice');
    const nameIdx = script.indexOf('$_.DisplayName -eq $requestedVoice');
    expect(idIdx).toBeGreaterThan(-1);
    expect(descIdx).toBeGreaterThan(idIdx);
    expect(nameIdx).toBeGreaterThan(descIdx);
    // Exact equality only - no -like/-match that could pick another voice.
    expect(script).not.toMatch(/-like|-match/);
  });

  it('throws instead of falling back to the default (possibly English) voice when no voice matches', () => {
    expect(script).toContain("if (-not $targetVoice) { throw ('OneCore voice not found: ' + $requestedVoice) };");
    const throwIdx = script.indexOf('OneCore voice not found');
    expect(script.indexOf('$synth.Voice = $targetVoice;')).toBeGreaterThan(throwIdx);
  });

  it('verifies the synthesizer actually switched to the selected voice Id before synthesizing', () => {
    const checkIdx = script.indexOf("if ($synth.Voice.Id -ne $targetVoice.Id) { throw ('OneCore voice selection failed: '");
    expect(checkIdx).toBeGreaterThan(-1);
    expect(script.indexOf('SynthesizeTextToStreamAsync')).toBeGreaterThan(checkIdx);
  });

  it('the voice name listed for Microsoft An is accepted by speak() and routed to OneCore, not SAPI', async () => {
    const execFn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) =>
      args[2].includes('SynthesizeTextToStreamAsync') ? `ONECORE_VOICE|Microsoft An|vi-VN|${AN_ID}\r\n` : REAL_WIN10_VOICE_OUTPUT
    );
    const oneCore = new WindowsOneCoreTtsEngine(execFn);
    const sapi = { speak: vi.fn().mockResolvedValue(undefined), listVoices: vi.fn().mockResolvedValue(['Microsoft David Desktop', 'Microsoft Zira Desktop']) };
    const router = new WindowsTtsRouter(sapi, oneCore);

    const listed = await router.listVoices();
    expect(listed).toContain(AN_VOICE);

    await router.speak('Xin chào', { voice: AN_VOICE, volume: 70 });
    expect(sapi.speak).not.toHaveBeenCalled();
    const speakScript = (execFn.mock.calls.at(-1) as [string, string[]])[1][2];
    expect(speakScript).toContain(`$requestedVoice = '${AN_VOICE}';`);

    await router.speak('Hello', { voice: 'Microsoft David Desktop', volume: 70 });
    await router.speak('Hello', { voice: 'Microsoft Zira Desktop', volume: 70 });
    expect(sapi.speak).toHaveBeenCalledTimes(2);
    expect(sapi.speak.mock.calls.map((c) => c[1].voice)).toEqual(['Microsoft David Desktop', 'Microsoft Zira Desktop']);
  });

  it('the Vietnamese Description is the only listed name for vi-VN; English voices keep their own names', async () => {
    const engine = new WindowsOneCoreTtsEngine(vi.fn().mockResolvedValue(REAL_WIN10_VOICE_OUTPUT));
    const viVoices = (await engine.listVoiceDetails()).filter((v) => v.language === 'vi-VN');
    expect(viVoices.map((v) => v.description)).toEqual([AN_VOICE]);
    expect(viVoices[0].displayName).toBe('Microsoft An');
  });
});

// Live check against the real WinRT API. Mocked exec output could not catch
// R5 defect #1 (instance access returned $null silently), so on Windows this
// runs the actual enumeration script. It only enumerates - it never speaks.
describe.runIf(process.platform === 'win32')('WindowsOneCoreTtsEngine (Phase 13D-R6): live Windows enumeration', () => {
  it('enumerates at least one OneCore voice, and Microsoft An as vi-VN when installed', async () => {
    const details = await new WindowsOneCoreTtsEngine().listVoiceDetails();
    expect(details.length).toBeGreaterThan(0);
    const an = details.find((v) => v.displayName === 'Microsoft An');
    if (an) {
      expect(an.language).toBe('vi-VN');
      expect(an.description).toBe(AN_VOICE);
    }
  }, 30_000);
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
    expect(script).toContain("$requestedVoice = 'O''Brien''s Voice';");
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
