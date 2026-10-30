import type { ProbeClient } from './build-probe-client.ts';
import { isPermanentRefusal } from './is-permanent-refusal.ts';
import type { ProbeStore } from './open-probe-store.ts';

export interface FlushResult {
  sent: number;
  dropped: number;
  kept: number;
}

// Reports each stored push receipt with the time the phone received it. A receipt the server
// refuses for good, such as one for a push from before a restart, is dropped; one that fails for
// now stays stored for the next push, sync or page start.
export async function flushReceipts(client: ProbeClient, store: ProbeStore): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, dropped: 0, kept: 0 };

  for (const receipt of await store.listReceipts()) {
    try {
      await client.pushReceived(receipt);
      await store.removeReceipt(receipt.pushID);
      result.sent += 1;
    } catch (error) {
      if (isPermanentRefusal(error)) {
        console.warn('push receipt refused', receipt.pushID, error.message);
        await store.removeReceipt(receipt.pushID);
        result.dropped += 1;
      } else {
        result.kept += 1;
      }
    }
  }

  return result;
}
