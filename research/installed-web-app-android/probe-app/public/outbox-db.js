// The block 7 outbox in IndexedDB, which the page and the service worker both open: a service
// worker cannot read localStorage.
const outboxDB = {
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('probe-outbox', 1);

      request.onupgradeneeded = () => request.result.createObjectStore('messages', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async run(mode, action) {
    const db = await outboxDB.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('messages', mode);
      const request = action(transaction.objectStore('messages'));

      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  add(message) {
    return outboxDB.run('readwrite', (store) => store.put(message));
  },

  list() {
    return outboxDB.run('readonly', (store) => store.getAll());
  },

  remove(id) {
    return outboxDB.run('readwrite', (store) => store.delete(id));
  },
};
