import { fileURLToPath } from 'node:url';

// The SQLite worker's source, which the release build bundles as an entry point of its own beside
// the server's.
export const sqliteWorkerEntry = fileURLToPath(new URL('sqlite-worker.ts', import.meta.url));
