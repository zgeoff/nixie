import { join } from 'node:path';
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { makeWebFetch } from './make-web-fetch';
import { requireAPIURL } from './require-api-url';

// Bun as PID 1 ignores SIGTERM unless the program handles it.
process.on('SIGTERM', () => {
  process.exit(0);
});

export default createServerEntry({
  fetch: makeWebFetch({
    apiURL: requireAPIURL(),
    clientDir: join(import.meta.dir, '..', 'client'),
    startFetch: (request) => handler.fetch(request),
  }),
});
