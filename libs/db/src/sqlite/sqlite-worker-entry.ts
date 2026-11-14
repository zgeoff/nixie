import { fileURLToPath } from 'node:url';

export const sqliteWorkerEntry = fileURLToPath(new URL('sqlite-worker.ts', import.meta.url));
