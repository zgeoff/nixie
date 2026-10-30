// The service worker's entry: it wires each event to a tested action and holds no logic of its own.
import { outboxSyncTag, pushPayloadSchema, receiptSyncTag } from '../src/contract.ts';
import { approveFromNotification } from './approve-from-notification.ts';
import { buildProbeClient } from './build-probe-client.ts';
import { drainOutbox } from './drain-outbox.ts';
import { flushReceipts } from './flush-receipts.ts';
import { openProbeStore } from './open-probe-store.ts';
import { pickNotificationClick } from './pick-notification-click.ts';
import { receivePush } from './receive-push.ts';
import type { ProbeNotificationOptions } from './show-notification.ts';

// TypeScript's DOM types describe a page, not a service worker, so the entry names the parts of the
// worker's scope it uses.
interface ExtendableEventLike extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface WorkerScope {
  location: Location;
  indexedDB: IDBFactory;
  registration: ServiceWorkerRegistration & {
    sync?: { register: (tag: string) => Promise<void> };
  };
  clients: {
    claim: () => Promise<void>;
    matchAll: (options: {
      type: 'window';
      includeUncontrolled: boolean;
    }) => Promise<{ url: string; focus: () => Promise<unknown> }[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
  skipWaiting: () => Promise<void>;
  addEventListener: (type: string, listener: (event: ExtendableEventLike) => void) => void;
}

declare const self: WorkerScope;

const client = buildProbeClient({ origin: self.location.origin });
const store = openProbeStore(self.indexedDB);
const showNotification = (title: string, options: ProbeNotificationOptions) =>
  self.registration.showNotification(title, options);

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const receivedAt = Date.now();
  const data: unknown = 'data' in event ? event.data : null;
  const push = pushPayloadSchema.parse(hasJSON(data) ? data.json() : null);

  event.waitUntil(
    receivePush(push, receivedAt, client, store, showNotification).then(async (result) => {
      if (result.kept > 0) {
        await self.registration.sync?.register(receiptSyncTag);
      }
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  if (!('notification' in event && event.notification instanceof Notification)) {
    return;
  }

  const action = 'action' in event && typeof event.action === 'string' ? event.action : '';
  const click = pickNotificationClick(action, event.notification.data);

  event.notification.close();
  event.waitUntil(
    click.kind === 'approve'
      ? approveFromNotification(click.approval, event.notification.tag, client, showNotification)
      : openPage(click.page),
  );
});

self.addEventListener('sync', (event) => {
  const tag = 'tag' in event ? event.tag : '';
  const lastChance = 'lastChance' in event && event.lastChance === true;

  if (tag === outboxSyncTag) {
    event.waitUntil(
      drainOutbox(lastChance, client, store).then((result) => {
        // a rejected sync makes Chrome schedule a retry
        if (result.kept > 0) {
          throw new Error(`${result.kept} messages wait for the next sync`);
        }
      }),
    );
  }

  if (tag === receiptSyncTag) {
    event.waitUntil(
      flushReceipts(client, store).then((result) => {
        if (result.kept > 0) {
          throw new Error(`${result.kept} receipts wait for the next sync`);
        }
      }),
    );
  }
});

function hasJSON(value: unknown): value is { json: () => unknown } {
  return typeof value === 'object' && value !== null && 'json' in value && typeof value.json === 'function';
}

async function openPage(path: string): Promise<unknown> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((window) => new URL(window.url).pathname === path);

  return open === undefined ? self.clients.openWindow(path) : open.focus();
}
