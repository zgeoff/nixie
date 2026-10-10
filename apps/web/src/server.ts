import { join } from 'node:path';
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { makeWebFetch } from './make-web-fetch';
import { requireAPIURL } from './require-api-url';

// Bun as PID 1 ignores SIGTERM unless the program handles it.
process.on('SIGTERM', () => {
  process.exit(0);
});

// Start's server entry, which the Vite build bundles into dist/server/server.js with every
// dependency. Bun serves a main module whose default export has a fetch method, on the port in
// PORT, so `bun dist/server/server.js` is the whole web server.
export default createServerEntry({
  fetch: makeWebFetch({
    apiURL: requireAPIURL(),
    clientDir: join(import.meta.dir, '..', 'client'),
    startFetch: (request) => handler.fetch(request),
  }),
});
