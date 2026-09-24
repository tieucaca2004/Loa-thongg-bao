import type { TtsEngine, ExecFn } from './TtsEngine.js';
import { defaultExec } from './TtsEngine.js';

/** Enriched voice info, beyond the bare-string `TtsEngine.listVoices()` contract. */
export interface OneCoreVoiceInfo {
  /** WinRT `VoiceInformation.DisplayName`, e.g. "Microsoft An". */
  displayName: string;
  /** WinRT `VoiceInformation.Language` (BCP-47), e.g. "vi-VN". */
  language: string;
  /** WinRT `VoiceInformation.Description`, e.g. "Microsoft An - Vietnamese (Vietnam)". */
  description: string;
  /** WinRT `VoiceInformation.Id` (OneCore registry token path). */
  id: string;
}

/**
 * Windows OneCore TTS engine (Phase 13D-R4), for voices Classic SAPI cannot
 * see — e.g. "Microsoft An - Vietnamese (Vietnam)" (vi-VN), registered under
 * HKLM\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens rather than the
 * classic HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens hive that
 * `WindowsSapiTtsEngine` / System.Speech reads (see Phase 13D-R3 analysis).
 *
 * This is a SEPARATE engine, not a modification of WindowsSapiTtsEngine.
 * Both implement the same `TtsEngine` interface; `WindowsTtsRouter` decides
 * which one handles a given `speak()` call by voice name.
 *
 * Mechanism: shells out to Windows PowerShell 5.1 (`powershell.exe`, never
 * `pwsh`), using the WinRT type-literal projection
 * (`[Type,Assembly,ContentType=WindowsRuntime]`) to reach
 * `Windows.Media.SpeechSynthesis.SpeechSynthesizer` — the same "shell out,
 * no new npm/native dependency" shape `WindowsSapiTtsEngine` already uses,
 * so packaging, admin requirements, and the Electron/Node runtime are
 * unaffected. Requires Windows 10+.
 *
 * Phase 13D-R6 (from native Windows 10 verification in R5):
 *  - `SpeechSynthesizer.AllVoices` is a STATIC WinRT property. Reading it
 *    from an instance (`$synth.AllVoices`) silently yields `$null` in
 *    PowerShell, so both scripts read `[...SpeechSynthesizer]::AllVoices`.
 *  - WinRT reports `DisplayName` "Microsoft An" and `Description`
 *    "Microsoft An - Vietnamese (Vietnam)" (language vi-VN). `listVoices()`
 *    exposes the Description (the name Windows Settings shows, and what
 *    `WindowsTtsRouter` routes on); `speak()` accepts a voice by exact Id,
 *    Description or DisplayName, and verifies the synthesizer really
 *    switched to that voice — never falling back to the default voice.
 *
 * Unlike classic SAPI's `Speak()` (synthesizes AND plays in one blocking
 * call), WinRT `SynthesizeTextToStreamAsync()` only synthesizes — it
 * returns an audio stream. Playback must be driven explicitly, which this
 * engine does with `System.Media.SoundPlayer.PlaySync()` (blocking, no
 * fixed sleeps) so the PowerShell process only exits — and this class's
 * `speak()` Promise only resolves — once synthesis AND playback have
 * genuinely finished. Volume is applied at the playback stage (via a
 * `waveOutSetVolume` P/Invoke, since `Windows.Media.SpeechSynthesis`
 * exposes no synthesis-time volume, unlike classic SAPI's `.Volume`).
 */
export class WindowsOneCoreTtsEngine implements TtsEngine {
  constructor(private readonly execFn: ExecFn = defaultExec) {}

  /**
   * Voice names for the `TtsEngine.listVoices()` contract: the WinRT
   * Description (e.g. "Microsoft An - Vietnamese (Vietnam)"), falling back
   * to DisplayName if a voice has no Description. The Description embeds the
   * language, so the OneCore voices stay distinct from classic SAPI names
   * ("Microsoft David Desktop") and are self-describing in the voice picker.
   */
  async listVoices(): Promise<string[]> {
    const voices = await this.listVoiceDetails();
    return voices.map((v) => v.description || v.displayName);
  }

  /** Enriched enumeration (display name, BCP-47 language, description, stable id). */
  async listVoiceDetails(): Promise<OneCoreVoiceInfo[]> {
    const output = await this.execFn('powershell', ['-NoProfile', '-Command', buildOneCoreListVoicesScript()]);
    return parseVoiceListOutput(output);
  }

  async speak(text: string, options: { voice?: string; volume: number }): Promise<void> {
    const volumePercent = Math.max(0, Math.min(100, Math.round(options.volume)));
    const script = buildOneCoreSpeakScript(text, { voiceName: options.voice, volumePercent });
    await this.execFn('powershell', ['-NoProfile', '-Command', script]);
  }
}

/**
 * Escapes a string for embedding inside a PowerShell SINGLE-quoted literal
 * ('...'). Single-quoted PowerShell strings perform no interpolation or
 * escape processing at all except doubling an embedded single quote — this
 * is deliberately safer than the double-quoted interpolation
 * WindowsSapiTtsEngine uses, because payment `content` text (ultimately
 * sourced from the webhook payload) must never be able to trigger
 * PowerShell variable/subexpression expansion (`$var`, `$(...)`, `` `n ``,
 * etc.) inside the generated script. Newlines are collapsed to a space for
 * clean, single-line spoken announcements (the formatter never emits
 * newlines today, but this stays defensive for e.g. arbitrary Test TTS
 * input typed by a developer).
 */
function escapeForSingleQuotedPs(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/'/g, "''");
}

/**
 * Static WinRT property access. `AllVoices` is static on SpeechSynthesizer;
 * `$synth.AllVoices` on an instance evaluates to `$null` without any error
 * (the Phase 13D-R5 defect), so it must always be read through the type.
 */
export const ONECORE_ALL_VOICES = '[Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices';

export function buildOneCoreListVoicesScript(): string {
  return [
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime;',
    '[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime] | Out-Null;',
    `foreach ($v in ${ONECORE_ALL_VOICES}) { Write-Output ($v.DisplayName + '|' + $v.Language + '|' + $v.Description + '|' + $v.Id) }`,
  ].join(' ');
}

export function buildOneCoreSpeakScript(
  text: string,
  options: { voiceName?: string; volumePercent: number }
): string {
  const escapedText = escapeForSingleQuotedPs(text);
  const volume16 = Math.round((options.volumePercent / 100) * 65535);

  // Exact match only, in priority order Id -> Description -> DisplayName
  // (e.g. "Microsoft An - Vietnamese (Vietnam)" or "Microsoft An"). No
  // partial/fuzzy match and no default-voice fallback: an unknown name
  // throws, so a Vietnamese request can never be spoken by an English voice.
  // After assignment the synthesizer's actual voice Id is re-checked.
  const voiceSelection = options.voiceName
    ? [
        `$requestedVoice = '${escapeForSingleQuotedPs(options.voiceName)}';`,
        `$allVoices = @(${ONECORE_ALL_VOICES});`,
        '$targetVoice = $allVoices | Where-Object { $_.Id -eq $requestedVoice } | Select-Object -First 1;',
        'if (-not $targetVoice) { $targetVoice = $allVoices | Where-Object { $_.Description -eq $requestedVoice } | Select-Object -First 1 };',
        'if (-not $targetVoice) { $targetVoice = $allVoices | Where-Object { $_.DisplayName -eq $requestedVoice } | Select-Object -First 1 };',
        "if (-not $targetVoice) { throw ('OneCore voice not found: ' + $requestedVoice) };",
        '$synth.Voice = $targetVoice;',
        "if ($synth.Voice.Id -ne $targetVoice.Id) { throw ('OneCore voice selection failed: ' + $requestedVoice) };",
        "Write-Output ('ONECORE_VOICE|' + $synth.Voice.DisplayName + '|' + $synth.Voice.Language + '|' + $synth.Voice.Id);",
      ].join(' ')
    : '';

  return [
    // WinRT projection + the IAsyncOperation<T> -> Task bridge (no native
    // Node/Electron dependency: this is PowerShell/.NET reflecting into
    // Windows Runtime, the same category of OS access System.Speech already
    // uses, just a different Windows API surface).
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime;',
    '[Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime] | Out-Null;',
    "$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0];",
    'function Await($WinRtTask, $ResultType) {',
    '$asTask = $asTaskGeneric.MakeGenericMethod($ResultType);',
    '$netTask = $asTask.Invoke($null, @($WinRtTask));',
    // Blocks on the real .NET Task completion signal - no fixed sleep, no
    // "assume it's done after launching a process".
    '$netTask.Wait(-1) | Out-Null;',
    'return $netTask.Result',
    '};',
    '$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer;',
    voiceSelection,
    `$stream = Await ($synth.SynthesizeTextToStreamAsync('${escapedText}')) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]);`,
    // WinRT synthesis only produces an audio stream - unlike classic SAPI's
    // Speak(), it does not play it. Playback is explicit from here on.
    '$netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream);',
    // Volume: Windows.Media.SpeechSynthesis has no synthesis-time volume
    // property (unlike classic SAPI's .Volume), so it is applied at the
    // playback stage via a waveOutSetVolume P/Invoke - OS-provided,
    // no admin rights, no new dependency.
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class AtieuOneCoreVolume { [DllImport(\"winmm.dll\")] public static extern int waveOutSetVolume(IntPtr hwo, uint dwVolume); }';",
    `$vol16 = [uint32]${volume16};`,
    '$packedVolume = [uint32]($vol16 -bor ($vol16 -shl 16));',
    '[AtieuOneCoreVolume]::waveOutSetVolume([IntPtr]::Zero, $packedVolume) | Out-Null;',
    '$player = New-Object System.Media.SoundPlayer;',
    '$player.Stream = $netStream;',
    // PlaySync() blocks until playback genuinely finishes - the PowerShell
    // process only exits after this, so the Node-side Promise (which
    // resolves on process exit) represents real completion of synthesis
    // AND playback, never an early resolve.
    '$player.PlaySync();',
  ].join(' ');
}

function parseVoiceListOutput(output: string): OneCoreVoiceInfo[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // DisplayName|Language|Description|Id — Id last so any '|' in it survives.
      const parts = line.split('|');
      const displayName = parts[0] ?? '';
      const language = parts[1] ?? '';
      const description = parts[2] ?? '';
      const id = parts.length > 3 ? parts.slice(3).join('|') : '';
      return { displayName, language, description, id };
    })
    .filter((v) => v.displayName.length > 0);
}
