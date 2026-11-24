// Waits until the speech layer has said nothing for quietMs, or maxMs passes. GPT-Live sends no
// event when it stops speaking, so silence in its output transcript stands in for the end.
import type { Sideband } from './attach-sideband.ts';

const pollMs = 100;

export async function waitForQuiet(sideband: Sideband, quietMs: number, maxMs: number): Promise<void> {
  const startedAtMs = Date.now();
  while (Date.now() - startedAtMs < maxMs) {
    const lastSpoken = sideband.log.findLast((entry) => entry.event.type === 'session.output_transcript.delta');
    const sinceMs = Date.now() - Math.max(lastSpoken?.receivedAtMs ?? 0, startedAtMs);
    if (sinceMs >= quietMs) {
      return;
    }
    await Bun.sleep(pollMs);
  }
}
