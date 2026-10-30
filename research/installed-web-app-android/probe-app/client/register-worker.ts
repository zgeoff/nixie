import { outboxSyncTag, pushPayloadSchema, receiptSyncTag } from '../src/contract.ts';
import { approveFromNotification } from './approve-from-notification.ts';
import type { ProbeClient } from './build-probe-client.ts';
import { drainOutbox } from './drain-outbox.ts';
import { flushReceipts } from './flush-receipts.ts';
import { openProbeStore } from './open-probe-store.ts';
import { pickNotificationClick } from './pick-notification-click.ts';
import { receivePush } from './receive-push.ts';
import type { ProbeNotificationOptions } from './show-notification.ts';

export interface WorkerEvent {
  waitUntil: (promise: Promise<unknown>) => void;
}

// TypeScript's DOM types describe a page, not a service worker, so the worker names the parts of
// its scope it uses.
export interface WorkerScope {
  indexedDB: IDBFactory;
  registration: {
    showNotification: (title: string, options: ProbeNotificationOptions) => Promise<void>;
    sync?: { register: (tag: string) => Promise<void> };
  };
  clients: {
    claim: () => Promise<void>;
    matchAll: (options: {
      type: 'window';
      includeUncontrolled: boolean;
    }) => Promise<readonly { url: string; focus: () => Promise<unknown> }[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
  skipWaiting: () => Promise<void>;
  addEventListener: (type: string, listener: (event: WorkerEvent) => void) => void;
}

// Wires each service worker event to its action. A sync that leaves work behind hands waitUntil a
// rejected promise, which makes Chrome schedule a retry.
export function registerWorker(scope: WorkerScope, client: ProbeClient): void {
  const store = openProbeStore(scope.indexedDB);
  const showNotification = (title: string, options: ProbeNotificationOptions) =>
    scope.registration.showNotification(title, options);

  scope.addEventListener('install', () => void scope.skipWaiting());
  scope.addEventListener('activate', (event) => event.waitUntil(scope.clients.claim()));

  scope.addEventListener('push', (event) => {
    const receivedAt = Date.now();
    const data: unknown = 'data' in event ? event.data : null;
    const push = pushPayloadSchema.parse(hasJSON(data) ? data.json() : null);

    event.waitUntil(
      receivePush(push, receivedAt, client, store, showNotification).then(async (result) => {
        if (result.kept > 0) {
          await scope.registration.sync?.register(receiptSyncTag);
        }
      }),
    );
  });

  scope.addEventListener('notificationclick', (event) => {
    const notification: unknown = 'notification' in event ? event.notification : null;

    if (!isNotification(notification)) {
      return;
    }

    const action = 'action' in event && typeof event.action === 'string' ? event.action : '';
    const click = pickNotificationClick(action, notification.data);

    notification.close();
    event.waitUntil(
      click.kind === 'approve'
        ? approveFromNotification(click.approval, notification.tag, client, showNotification)
        : openPage(scope, click.page),
    );
  });

  scope.addEventListener('sync', (event) => {
    const tag = 'tag' in event ? event.tag : '';
    const lastChance = 'lastChance' in event && event.lastChance === true;

    if (tag === outboxSyncTag) {
      event.waitUntil(
        drainOutbox(lastChance, client, store).then((result) => {
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
}

function hasJSON(value: unknown): value is { json: () => unknown } {
  return (
    typeof value === 'object' && value !== null && 'json' in value && typeof value.json === 'function'
  );
}

function isNotification(
  value: unknown,
): value is { data: unknown; tag: string; close: () => void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag' in value &&
    typeof value.tag === 'string' &&
    'close' in value &&
    typeof value.close === 'function'
  );
}

async function openPage(scope: WorkerScope, path: string): Promise<unknown> {
  const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((window) => new URL(window.url).pathname === path);

  return open === undefined ? scope.clients.openWindow(path) : open.focus();
}
