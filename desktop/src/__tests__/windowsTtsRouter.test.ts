import { describe, expect, it, vi } from 'vitest';
import { WindowsTtsRouter } from '../tts/WindowsTtsRouter.js';
import type { TtsEngine } from '../tts/TtsEngine.js';

const DAVID = 'Microsoft David Desktop';
const ZIRA = 'Microsoft Zira Desktop';
const AN = 'Microsoft An - Vietnamese (Vietnam)';

function fakeEngine(voices: string[]): TtsEngine {
  return {
    speak: vi.fn().mockResolvedValue(undefined),
    listVoices: vi.fn().mockResolvedValue(voices),
  };
}

describe('WindowsTtsRouter (Phase 13D-R4): dispatch', () => {
  it('merges classic and OneCore voice lists (classic first)', async () => {
    const classic = fakeEngine([DAVID, ZIRA]);
    const oneCore = fakeEngine([AN]);
    const router = new WindowsTtsRouter(classic, oneCore);

    const voices = await router.listVoices();

    expect(voices).toEqual([DAVID, ZIRA, AN]);
  });

  it('routes a classic SAPI voice (David) to the classic engine, never OneCore', async () => {
    const classic = fakeEngine([DAVID, ZIRA]);
    const oneCore = fakeEngine([AN]);
    const router = new WindowsTtsRouter(classic, oneCore);
    await router.listVoices();

    await router.speak('hello', { voice: DAVID, volume: 80 });

    expect(classic.speak).toHaveBeenCalledWith('hello', { voice: DAVID, volume: 80 });
    expect(oneCore.speak).not.toHaveBeenCalled();
  });

  it('routes the OneCore voice (Microsoft An) to the OneCore engine, never classic SAPI', async () => {
    const classic = fakeEngine([DAVID, ZIRA]);
    const oneCore = fakeEngine([AN]);
    const router = new WindowsTtsRouter(classic, oneCore);
    await router.listVoices();

    await router.speak('Đã nhận một trăm nghìn đồng.', { voice: AN, volume: 80 });

    expect(oneCore.speak).toHaveBeenCalledWith('Đã nhận một trăm nghìn đồng.', { voice: AN, volume: 80 });
    expect(classic.speak).not.toHaveBeenCalled();
  });

  it('routes correctly even without a prior listVoices() call (lazy enumeration)', async () => {
    const classic = fakeEngine([DAVID]);
    const oneCore = fakeEngine([AN]);
    const router = new WindowsTtsRouter(classic, oneCore);

    // No listVoices() call first - simulates Test Speaker/Test TTS being
    // clicked before the renderer's own listVoices() round trip completes.
    await router.speak('hi', { voice: AN, volume: 80 });

    expect(oneCore.speak).toHaveBeenCalledTimes(1);
    expect(classic.speak).not.toHaveBeenCalled();
  });

  it('defaults to the classic engine when no voice is selected (preserves prior default behavior)', async () => {
    const classic = fakeEngine([DAVID]);
    const oneCore = fakeEngine([AN]);
    const router = new WindowsTtsRouter(classic, oneCore);

    await router.speak('hi', { volume: 80 });

    expect(classic.speak).toHaveBeenCalledTimes(1);
    expect(oneCore.speak).not.toHaveBeenCalled();
  });

  it('defaults to the classic engine for an unrecognized voice name', async () => {
    const classic = fakeEngine([DAVID]);
    const oneCore = fakeEngine([AN]);
    const router = new WindowsTtsRouter(classic, oneCore);
    await router.listVoices();

    await router.speak('hi', { voice: 'Some Unknown Voice', volume: 80 });

    expect(classic.speak).toHaveBeenCalledTimes(1);
    expect(oneCore.speak).not.toHaveBeenCalled();
  });

  it('a failing OneCore engine never breaks classic voice listing or routing', async () => {
    const classic = fakeEngine([DAVID, ZIRA]);
    const oneCore: TtsEngine = {
      speak: vi.fn(),
      listVoices: vi.fn().mockRejectedValue(new Error('WinRT projection unavailable')),
    };
    const router = new WindowsTtsRouter(classic, oneCore);

    const voices = await router.listVoices();
    expect(voices).toEqual([DAVID, ZIRA]);

    await router.speak('hi', { voice: DAVID, volume: 80 });
    expect(classic.speak).toHaveBeenCalledTimes(1);
  });
});

describe('WindowsTtsRouter (Phase 13D-R4): frozen classic SAPI path regression guard', () => {
  it('passes text/voice/volume through to the classic engine completely unmodified', async () => {
    const classic = fakeEngine([DAVID]);
    const oneCore = fakeEngine([]);
    const router = new WindowsTtsRouter(classic, oneCore);
    await router.listVoices();

    await router.speak('Đã nhận hai trăm nghìn đồng. Nội dung ATIEU 1234.', { voice: DAVID, volume: 55 });

    expect(classic.speak).toHaveBeenCalledWith('Đã nhận hai trăm nghìn đồng. Nội dung ATIEU 1234.', {
      voice: DAVID,
      volume: 55,
    });
  });
});
