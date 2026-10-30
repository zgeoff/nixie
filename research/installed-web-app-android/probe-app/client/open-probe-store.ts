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

type MessageRow =
  | (OutboxMessage & { state: 'queued' | 'sent' })
  | (RefusedMessage & { state: 'refused' });

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

      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
  }

  // Reads the message's current state and writes its next one in a single transaction, and
  // refuses a move that the transition table lacks. A new message starts from the given message,
  // and every other move starts from the stored row.
  async function moveMessage(
    id: string,
    to: MessageState,
    buildRow: (current: OutboxMessage) => MessageRow,
    newMessage: OutboxMessage | null,
  ): Promise<void> {
    const db = await opening;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('messages', 'readwrite');
      const messages = transaction.objectStore('messages');
      const reading = messages.get(id);
      let refusal: Error | null = null;

      reading.addEventListener('success', () => {
        const current: unknown = reading.result;
        const row = isMessageRow(current) ? current : null;
        const from = row === null ? 'absent' : row.state;
        const start = row ?? newMessage;

        // the transition table moves a message with no row only to queued, which passes a message
        if (!canMoveMessage(from, to) || start === null) {
          refusal = new Error(`message ${id} cannot move from ${from} to ${to}`);
          transaction.abort();

          return;
        }

        messages.put(buildRow(start));
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
    addMessage: (message) =>
      moveMessage(message.id, 'queued', (start) => ({ ...start, state: 'queued' }), message),
    listMessages: async () =>
      (await listRows('messages'))
        .filter(isMessageRow)
        .filter((row) => row.state === 'queued')
        .map((row) => ({ id: row.id, text: row.text, queuedAt: row.queuedAt })),
    markSent: (id) =>
      moveMessage(
        id,
        'sent',
        (start) => ({ id, text: start.text, queuedAt: start.queuedAt, state: 'sent' }),
        null,
      ),
    refuseMessage: (id, status, reason) =>
      moveMessage(
        id,
        'refused',
        (start) => ({
          id,
          text: start.text,
          queuedAt: start.queuedAt,
          state: 'refused',
          status,
          reason,
        }),
        null,
      ),
    listRefused: async () =>
      (await listRows('messages')).filter(isMessageRow).flatMap((row) =>
        row.state === 'refused'
          ? [
              {
                id: row.id,
                text: row.text,
                queuedAt: row.queuedAt,
                status: row.status,
                reason: row.reason,
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
    (row.state === 'queued' ||
      row.state === 'sent' ||
      (row.state === 'refused' &&
        'status' in row &&
        typeof row.status === 'number' &&
        'reason' in row &&
        typeof row.reason === 'string'))
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
