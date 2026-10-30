import type { PushPayload } from '../src/contract.ts';
import type { ProbeNotificationOptions } from './show-notification.ts';

// The notification a push shows: its send time in the body, and Approve and Open buttons when it
// carries an approval. Chrome needs a tag before it renotifies.
export function buildNotification(push: PushPayload): {
  title: string;
  options: ProbeNotificationOptions;
} {
  const sent = new Date(push.sentAt).toLocaleTimeString();
  const options: ProbeNotificationOptions = {
    body: `Sent ${sent}, urgency ${push.urgency}${push.approval === null ? '' : '. Approve or open.'}`,
    icon: '/icons/launcher-192.png',
    badge: '/icons/badge-96.png',
    data: {
      approval: push.approval,
      page: push.approval === null ? '/block-1.html' : '/block-2.html',
    },
    silent: push.silent,
  };

  if (push.tag !== '') {
    options.tag = push.tag;
    options.renotify = push.renotify;
  }

  if (push.approval !== null) {
    options.actions = [
      { action: 'approve', title: 'Approve' },
      { action: 'open', title: 'Open' },
    ];
  }

  return { title: push.title, options };
}
