importScripts('/outbox-db.js');

// nixie's API refuses a call without this header, so the probe's endpoints do too
const clientHeaders = { 'content-type': 'application/json', 'x-nixie-client': 'probe-sw' };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const receivedAt = Date.now();
  const push = event.data ? event.data.json() : { title: 'empty push', tag: '' };
  const sent = new Date(push.sentAt).toLocaleTimeString();
  const options = {
    body: `Sent ${sent}, urgency ${push.urgency}${push.approval ? '. Approve or open.' : ''}`,
    icon: '/icons/launcher-192.png',
    badge: '/icons/badge-96.png',
    data: { pushID: push.pushID, approval: push.approval },
    silent: push.silent,
  };

  if (push.tag) {
    options.tag = push.tag;
    options.renotify = push.renotify;
  }

  if (push.approval) {
    options.actions = [
      { action: 'approve', title: 'Approve' },
      { action: 'open', title: 'Open' },
    ];
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(push.title, options),
      fetch('/api/push-received', {
        method: 'POST',
        headers: clientHeaders,
        body: JSON.stringify({ pushID: push.pushID, receivedAt }),
      }).catch(() => undefined),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  const { approval } = event.notification.data ?? {};

  event.notification.close();

  if (event.action === 'approve' && approval) {
    event.waitUntil(approve(approval, event.notification.tag));

    return;
  }

  event.waitUntil(openPage(approval ? '/block-2.html' : '/block-1.html'));
});

async function approve(approval, tag) {
  let outcome;

  try {
    const response = await fetch('/api/approve', {
      method: 'POST',
      headers: clientHeaders,
      credentials: 'same-origin',
      body: JSON.stringify(approval),
    });
    const body = await response.json();

    outcome = response.ok ? 'Approved' : `Refused (${response.status}): ${body.error}`;
  } catch (error) {
    outcome = `Approve failed: ${error}`;
  }

  await self.registration.showNotification(outcome, {
    body: 'The probe server logged the call. Open block 2 to read it.',
    icon: '/icons/launcher-192.png',
    badge: '/icons/badge-96.png',
    tag: tag || 'approve-result',
  });
}

async function openPage(path) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).pathname === path);

  if (open) {
    return open.focus();
  }

  return self.clients.openWindow(path);
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'probe-outbox') {
    event.waitUntil(sendOutbox(event.lastChance));
  }
});

async function sendOutbox(lastChance) {
  const messages = await outboxDB.list();

  for (const message of messages) {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: clientHeaders,
      credentials: 'same-origin',
      body: JSON.stringify({ ...message, messageID: message.id, lastChance }),
    });

    if (!response.ok) {
      // a rejected sync event makes Chrome schedule a retry
      throw new Error(`sync send refused: ${response.status}`);
    }

    await outboxDB.remove(message.id);
  }
}
