// oxlint-disable one-var -- spike code
// Serves the built Start app as its own process on Bun: static client assets from dist/client, and
// every other request through Start's server entry.
import { join } from 'node:path';

// The path sits in a variable because the build output does not exist until `bun run build`.
const entryPath = './dist/server/server.js';
const entry = ((await import(entryPath)) as { default: unknown }).default as {
  fetch: (request: Request) => Promise<Response>;
};
const clientDir = join(import.meta.dir, 'dist', 'client');

const server = Bun.serve({
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/assets/')) {
      const file = Bun.file(join(clientDir, pathname)),
        found = await file.exists();
      if (found) {
        return new Response(file);
      }
    }
    return await entry.fetch(request);
  },
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 3100),
});

process.on('SIGTERM', () => {
  void server.stop(true);
  process.exit(0);
});
