import type { PushPayload } from '../src/contract.ts';
import type { ProbeClient } from './build-probe-client.ts';
import { buildNotification } from './build-notification.ts';
import { type FlushResult, flushReceipts } from './flush-receipts.ts';
import type { ProbeStore } from './open-probe-store.ts';
import type { ShowNotification } from './show-notification.ts';

// Stores the receipt before anything else, so a report that fails keeps the time the phone received
// the push, then shows the notification and reports every stored receipt.
export async function receivePush(
  push: PushPayload,
  receivedAt: number,
  client: ProbeClient,
  store: ProbeStore,
  showNotification: ShowNotification,
): Promise<FlushResult> {
  await store.addReceipt({ pushID: push.pushID, receivedAt });

  const notification = buildNotification(push);

  await showNotification(notification.title, notification.options);

  return flushReceipts(client, store);
}
