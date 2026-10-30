import type { Approval } from '../src/contract.ts';
import type { ProbeClient } from './build-probe-client.ts';
import { isPermanentRefusal } from './is-permanent-refusal.ts';
import type { ShowNotification } from './show-notification.ts';

// Answers a tap on a notification's Approve button from the service worker: it calls the probe with
// the session cookie, then shows the server's answer in place of the notification. It opens no
// window, which block 2 records.
export async function approveFromNotification(
  approval: Approval,
  tag: string,
  client: ProbeClient,
  showNotification: ShowNotification,
): Promise<string> {
  const outcome = await client.approve(approval).then(
    () => 'Approved',
    (error: unknown) =>
      isPermanentRefusal(error)
        ? `Refused (${error.status}): ${error.message}`
        : `Approve failed: ${String(error)}`,
  );

  await showNotification(outcome, {
    body: 'The probe server logged the call. Open block 2 to read it.',
    icon: '/icons/launcher-192.png',
    badge: '/icons/badge-96.png',
    tag: tag === '' ? 'approve-result' : tag,
  });

  return outcome;
}
