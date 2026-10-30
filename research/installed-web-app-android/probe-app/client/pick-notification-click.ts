import { z } from 'zod';
import { type Approval, approvalSchema } from '../src/contract.ts';

export type NotificationClick =
  | { kind: 'approve'; approval: Approval }
  | { kind: 'open'; page: '/block-1.html' | '/block-2.html' };

// A notification from an older service worker, or one with no data, still opens a page.
const notificationDataSchema = z
  .object({
    approval: approvalSchema.nullable().catch(null),
    page: z.enum(['/block-1.html', '/block-2.html']).catch('/block-1.html'),
  })
  .catch({ approval: null, page: '/block-1.html' });

// Decides what a tap does: the Approve button of a push with an approval approves it, and every
// other tap opens the page the notification names.
export function pickNotificationClick(action: string, data: unknown): NotificationClick {
  const parsed = notificationDataSchema.parse(data);

  return action === 'approve' && parsed.approval !== null
    ? { kind: 'approve', approval: parsed.approval }
    : { kind: 'open', page: parsed.page };
}
