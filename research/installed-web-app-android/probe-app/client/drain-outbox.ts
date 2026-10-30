import type { ProbeClient } from './build-probe-client.ts';
import { isPermanentRefusal } from './is-permanent-refusal.ts';
import type { ProbeStore } from './open-probe-store.ts';

export interface DrainResult {
  sent: number;
  refused: number;
  kept: number;
}

// Sends each queued message. A message the server refuses for good moves aside with the reason, so
// it never blocks the messages behind it; one that fails for now stays queued for the next sync.
export async function drainOutbox(
  lastChance: boolean,
  client: ProbeClient,
  store: ProbeStore,
): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, refused: 0, kept: 0 };

  for (const message of await store.listMessages()) {
    try {
      await client.sync({
        messageID: message.id,
        text: message.text,
        queuedAt: message.queuedAt,
        lastChance,
      });
      await store.removeMessage(message.id);
      result.sent += 1;
    } catch (error) {
      if (isPermanentRefusal(error)) {
        await store.refuseMessage({ ...message, status: error.status, reason: error.message });
        result.refused += 1;
      } else {
        result.kept += 1;
      }
    }
  }

  return result;
}
