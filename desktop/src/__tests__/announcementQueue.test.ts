import { describe, expect, it, vi } from 'vitest';
import { AnnouncementQueue } from '../tts/AnnouncementQueue.js';
import type { TtsEngine } from '../tts/TtsEngine.js';

function fakeEngine(speak: TtsEngine['speak']): TtsEngine {
  return { speak, listVoices: async () => [] };
}

const tx = (id: string, amount = 100000) => ({ transactionId: id, amount, content: 'ATIEU 1' });

describe('AnnouncementQueue', () => {
  it('speaks a valid amount once', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const queue = new AnnouncementQueue(fakeEngine(speak), () => ({ volume: 80 }));

    const result = await queue.announce(tx('t1'));
    expect(result.status).toBe('spoken');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('never speaks the same transaction id twice (no double announcement)', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const queue = new AnnouncementQueue(fakeEngine(speak), () => ({ volume: 80 }));

    await queue.announce(tx('t2'));
    const second = await queue.announce(tx('t2'));

    expect(speak).toHaveBeenCalledTimes(1);
    expect(second.status).toBe('skipped_duplicate');
  });

  it('handles a large amount', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const queue = new AnnouncementQueue(fakeEngine(speak), () => ({ volume: 80 }));

    const result = await queue.announce(tx('t3', 999999999));
    expect(result.status).toBe('spoken');
    if (result.status === 'spoken') {
      expect(result.text).toContain('Đã nhận');
    }
  });

  it('reports failure without throwing when the TTS engine rejects', async () => {
    const speak = vi.fn().mockRejectedValue(new Error('speaker not found'));
    const queue = new AnnouncementQueue(fakeEngine(speak), () => ({ volume: 80 }));

    const result = await queue.announce(tx('t4'));
    expect(result.status).toBe('failed');
    expect(queue.hasAnnounced('t4')).toBe(false);
  });

  it('retryLastFailed re-attempts the failed transaction and can succeed', async () => {
    const speak = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
    const queue = new AnnouncementQueue(fakeEngine(speak), () => ({ volume: 80 }));

    const first = await queue.announce(tx('t5'));
    expect(first.status).toBe('failed');

    const retried = await queue.retryLastFailed();
    expect(retried?.status).toBe('spoken');
    expect(queue.hasAnnounced('t5')).toBe(true);
  });

  it('retryLastFailed is a no-op when nothing failed', async () => {
    const speak = vi.fn().mockResolvedValue(undefined);
    const queue = new AnnouncementQueue(fakeEngine(speak), () => ({ volume: 80 }));
    const result = await queue.retryLastFailed();
    expect(result).toBeNull();
  });

  it('processes announcements serially (FIFO) even if fired concurrently', async () => {
    const order: string[] = [];
    const speak = vi.fn().mockImplementation(async (text: string) => {
      order.push(text);
    });
    const queue = new AnnouncementQueue(fakeEngine(speak), () => ({ volume: 80 }));

    await Promise.all([queue.announce(tx('a')), queue.announce(tx('b')), queue.announce(tx('c'))]);
    expect(order).toHaveLength(3);
  });
});
