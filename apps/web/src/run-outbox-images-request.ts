const storeName = 'images';

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

function createOpenRequest(): IDBOpenDBRequest {
  const request = globalThis.indexedDB.open('nixie-outbox', 1);

  request.addEventListener('upgradeneeded', () => {
    request.result.createObjectStore(storeName);
  });

  return request;
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
