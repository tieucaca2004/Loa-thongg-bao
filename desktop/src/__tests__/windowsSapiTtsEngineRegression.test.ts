import { describe, expect, it, vi } from 'vitest';
import { WindowsSapiTtsEngine } from '../tts/TtsEngine.js';

/**
 * Phase 13D-R4 regression guard: WindowsSapiTtsEngine's own behavior must
 * be completely unchanged by adding WindowsOneCoreTtsEngine/WindowsTtsRouter
 * alongside it. This captures the exact PowerShell command it builds so any
 * future accidental edit to the frozen classic SAPI engine is caught here,
 * not discovered on real Windows hardware.
 */
describe('WindowsSapiTtsEngine (frozen): unchanged by the Phase 13D-R4 OneCore addition', () => {
  it('speak() builds the same System.Speech PowerShell command as before', async () => {
    const execFn = vi.fn().mockResolvedValue('');
    const engine = new WindowsSapiTtsEngine(execFn);

    await engine.speak('Đã nhận một trăm nghìn đồng.', { voice: 'Microsoft Zira Desktop', volume: 80 });

    expect(execFn).toHaveBeenCalledWith('powershell', [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.Speech; ' +
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
        '$s.SelectVoice("Microsoft Zira Desktop"); ' +
        '$s.Volume = 80; ' +
        '$s.Speak("Đã nhận một trăm nghìn đồng.");',
    ]);
  });

  it('speak() without a voice omits SelectVoice, exactly as before', async () => {
    const execFn = vi.fn().mockResolvedValue('');
    const engine = new WindowsSapiTtsEngine(execFn);

    await engine.speak('hi', { volume: 50 });

    expect(execFn).toHaveBeenCalledWith('powershell', [
      '-NoProfile',
      '-Command',
      // Note the double space where the (empty) voice-selection line would
      // go: WindowsSapiTtsEngine joins an empty string with ' ' when no
      // voice is given. This is pre-existing behavior, unchanged by this
      // phase - asserted here exactly as-is, not "fixed".
      'Add-Type -AssemblyName System.Speech; ' +
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;  ' +
        '$s.Volume = 50; ' +
        '$s.Speak("hi");',
    ]);
  });

  it('listVoices() builds the same System.Speech enumeration command as before', async () => {
    const execFn = vi.fn().mockResolvedValue('');
    const engine = new WindowsSapiTtsEngine(execFn);

    await engine.listVoices();

    expect(execFn).toHaveBeenCalledWith('powershell', [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.Speech; ' +
        '(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ' +
        'ForEach-Object { $_.VoiceInfo.Name }',
    ]);
  });
});
