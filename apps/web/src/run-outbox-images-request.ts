// Runs one request on the device's outbox database, whose one store keeps the images of each unsent
// message under its client message ID, and closes the database after it. A write resolves only once
// its transaction commits, so a reload right after it finds the images.
export async function runOutboxImagesRequest<T>(
  mode: IDBTransactionMode,
  makeRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await waitForRequest(createOpenRequest());

  try {
    const transaction = database.transaction(storeName, mode);

    const result = await waitForRequest(makeRequest(transaction.objectStore(storeName)));

    await waitForCommit(transaction);

    return result;
  } finally {
    database.close();
  }
}

const storeName = 'images';

// the images are Files, which IndexedDB keeps as they are and localStorage cannot
function createOpenRequest(): IDBOpenDBRequest {
  const request = globalThis.indexedDB.open('nixie-outbox', 1);

  request.addEventListener('upgradeneeded', () => {
    request.result.createObjectStore(storeName);
  });

  return request;
}

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  const settled = Promise.withResolvers<T>();

  request.addEventListener('success', () => {
    settled.resolve(request.result);
  });

  request.addEventListener('error', () => {
    settled.reject(request.error ?? new Error('the outbox database request failed'));
  });

  return settled.promise;
}

function waitForCommit(transaction: IDBTransaction): Promise<void> {
  const settled = Promise.withResolvers<void>();

  transaction.addEventListener('complete', () => {
    settled.resolve();
  });

  transaction.addEventListener('abort', () => {
    settled.reject(transaction.error ?? new Error('the outbox database transaction aborted'));
  });

  return settled.promise;
}
