// The outbox, its refused messages and the unsent push receipts, in IndexedDB, which the pages and
// the service worker both open: a service worker cannot read localStorage.

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
  removeMessage: (id: string) => Promise<void>;
  refuseMessage: (message: RefusedMessage) => Promise<void>;
  listRefused: () => Promise<RefusedMessage[]>;
  addReceipt: (receipt: PushReceipt) => Promise<void>;
  listReceipts: () => Promise<PushReceipt[]>;
  removeReceipt: (pushID: string) => Promise<void>;
}

type StoreName = 'outbox' | 'refused' | 'receipts';

export function openProbeStore(factory: IDBFactory): ProbeStore {
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('probe', 1);

    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore('outbox', { keyPath: 'id' });
      request.result.createObjectStore('refused', { keyPath: 'id' });
      request.result.createObjectStore('receipts', { keyPath: 'pushID' });
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });

  async function runRequest(
    names: StoreName[],
    mode: IDBTransactionMode,
    act: (transaction: IDBTransaction) => IDBRequest | undefined,
  ): Promise<unknown> {
    const db = await opening;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(names, mode);
      const request = act(transaction);

      transaction.addEventListener('complete', () => resolve(request?.result));
      transaction.addEventListener('error', () => reject(transaction.error));
    });
  }

  async function listAll(name: StoreName): Promise<unknown[]> {
    const rows = await runRequest([name], 'readonly', (transaction) =>
      transaction.objectStore(name).getAll(),
    );

    return Array.isArray(rows) ? rows : [];
  }

  return {
    addMessage: async (message) => {
      await runRequest(['outbox'], 'readwrite', (transaction) =>
        transaction.objectStore('outbox').put(message),
      );
    },
    listMessages: async () => (await listAll('outbox')).filter(isOutboxMessage),
    removeMessage: async (id) => {
      await runRequest(['outbox'], 'readwrite', (transaction) =>
        transaction.objectStore('outbox').delete(id),
      );
    },
    refuseMessage: async (message) => {
      await runRequest(['outbox', 'refused'], 'readwrite', (transaction) => {
        transaction.objectStore('outbox').delete(message.id);

        return transaction.objectStore('refused').put(message);
      });
    },
    listRefused: async () => (await listAll('refused')).filter(isRefusedMessage),
    addReceipt: async (receipt) => {
      await runRequest(['receipts'], 'readwrite', (transaction) =>
        transaction.objectStore('receipts').put(receipt),
      );
    },
    listReceipts: async () => (await listAll('receipts')).filter(isPushReceipt),
    removeReceipt: async (pushID) => {
      await runRequest(['receipts'], 'readwrite', (transaction) =>
        transaction.objectStore('receipts').delete(pushID),
      );
    },
  };
}

function isOutboxMessage(row: unknown): row is OutboxMessage {
  return (
    typeof row === 'object' &&
    row !== null &&
    'id' in row &&
    typeof row.id === 'string' &&
    'text' in row &&
    typeof row.text === 'string' &&
    'queuedAt' in row &&
    typeof row.queuedAt === 'number'
  );
}

function isRefusedMessage(row: unknown): row is RefusedMessage {
  return (
    isOutboxMessage(row) &&
    'status' in row &&
    typeof row.status === 'number' &&
    'reason' in row &&
    typeof row.reason === 'string'
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
