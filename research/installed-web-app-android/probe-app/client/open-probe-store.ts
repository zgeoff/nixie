import { canMoveMessage, type MessageState } from './can-move-message.ts';

// The outbox and the unsent push receipts, in IndexedDB, which the pages and the service worker
// both open: a service worker cannot read localStorage.

export interface OutboxMessage {
  id: string;
  text: string;
  queuedAt: number;
}

export interface RefusedMessage extends OutboxMessage {
  status: number;
  reason: string;
}

export interface PushReceipt {
  pushID: string;
  receivedAt: number;
}

export interface ProbeStore {
  addMessage: (message: OutboxMessage) => Promise<void>;
  listMessages: () => Promise<OutboxMessage[]>;
  markSent: (id: string) => Promise<void>;
  refuseMessage: (id: string, status: number, reason: string) => Promise<void>;
  listRefused: () => Promise<RefusedMessage[]>;
  addReceipt: (receipt: PushReceipt) => Promise<void>;
  listReceipts: () => Promise<PushReceipt[]>;
  removeReceipt: (pushID: string) => Promise<void>;
}

interface MessageRow extends OutboxMessage {
  state: MessageState;
  status?: number;
  reason?: string;
}

export function openProbeStore(factory: IDBFactory): ProbeStore {
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('probe', 2);

    request.addEventListener('upgradeneeded', (event) => {
      const db = request.result;

      if (event.oldVersion < 1) {
        db.createObjectStore('receipts', { keyPath: 'pushID' });
      }

      // version 1 kept the queued and the refused messages in 2 stores with no states
      for (const name of ['outbox', 'refused']) {
        if (db.objectStoreNames.contains(name)) {
          db.deleteObjectStore(name);
        }
      }

      db.createObjectStore('messages', { keyPath: 'id' });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });

  async function listRows(name: 'messages' | 'receipts'): Promise<unknown[]> {
    const db = await opening;

    return new Promise((resolve, reject) => {
      const request = db.transaction(name, 'readonly').objectStore(name).getAll();

      request.addEventListener('success', () =>
        resolve(Array.isArray(request.result) ? request.result : []),
      );
      request.addEventListener('error', () => reject(request.error));
    });
  }

  // Reads the message's current state and writes its next one in a single transaction, and
  // refuses a move that the transition table lacks.
  async function moveMessage(
    id: string,
    to: MessageState,
    buildRow: (current: MessageRow | undefined) => MessageRow,
  ): Promise<void> {
    const db = await opening;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('messages', 'readwrite');
      const messages = transaction.objectStore('messages');
      const reading = messages.get(id);
      let refusal: Error | null = null;

      reading.addEventListener('success', () => {
        const current: unknown = reading.result;
        const row = isMessageRow(current) ? current : undefined;
        const from = row?.state ?? 'absent';

        if (!canMoveMessage(from, to)) {
          refusal = new Error(`message ${id} cannot move from ${from} to ${to}`);
          transaction.abort();

          return;
        }

        messages.put(buildRow(row));
      });
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('abort', () => reject(refusal ?? transaction.error));
    });
  }

  async function writeReceipt(action: (receipts: IDBObjectStore) => void): Promise<void> {
    const db = await opening;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('receipts', 'readwrite');

      action(transaction.objectStore('receipts'));
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('error', () => reject(transaction.error));
    });
  }

  return {
    addMessage: (message) => moveMessage(message.id, 'queued', () => ({ ...message, state: 'queued' })),
    listMessages: async () =>
      (await listRows('messages'))
        .filter(isMessageRow)
        .filter((row) => row.state === 'queued')
        .map((row) => ({ id: row.id, text: row.text, queuedAt: row.queuedAt })),
    markSent: (id) =>
      moveMessage(id, 'sent', (current) => ({
        id,
        text: current?.text ?? '',
        queuedAt: current?.queuedAt ?? 0,
        state: 'sent',
      })),
    refuseMessage: (id, status, reason) =>
      moveMessage(id, 'refused', (current) => ({
        id,
        text: current?.text ?? '',
        queuedAt: current?.queuedAt ?? 0,
        state: 'refused',
        status,
        reason,
      })),
    listRefused: async () =>
      (await listRows('messages')).filter(isMessageRow).flatMap((row) =>
        row.state === 'refused'
          ? [
              {
                id: row.id,
                text: row.text,
                queuedAt: row.queuedAt,
                status: row.status ?? 0,
                reason: row.reason ?? '',
              },
            ]
          : [],
      ),
    addReceipt: (receipt) => writeReceipt((receipts) => receipts.put(receipt)),
    listReceipts: async () => (await listRows('receipts')).filter(isPushReceipt),
    removeReceipt: (pushID) => writeReceipt((receipts) => receipts.delete(pushID)),
  };
}

function isMessageRow(row: unknown): row is MessageRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'id' in row &&
    typeof row.id === 'string' &&
    'text' in row &&
    typeof row.text === 'string' &&
    'queuedAt' in row &&
    typeof row.queuedAt === 'number' &&
    'state' in row &&
    (row.state === 'queued' || row.state === 'sent' || row.state === 'refused')
  );
}

function isPushReceipt(row: unknown): row is PushReceipt {
  return (
    typeof row === 'object' &&
    row !== null &&
    'pushID' in row &&
    typeof row.pushID === 'string' &&
    'receivedAt' in row &&
    typeof row.receivedAt === 'number'
  );
}
