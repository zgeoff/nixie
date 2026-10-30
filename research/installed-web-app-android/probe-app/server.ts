import { join } from 'node:path';
import { isKnownPushService } from './src/is-known-push-service.ts';
import { makeProbeHandler, probeLimits } from './src/make-probe-handler.ts';
import { openVapidKeys } from './src/open-vapid-keys.ts';
import { runClientBuild } from './src/run-client-build.ts';

const port = Number(process.env['PORT'] ?? 8787);
const adminKey = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');
const answerRequest = makeProbeHandler({
  vapidKeys: await openVapidKeys(join(import.meta.dir, '.vapid')),
  adminKey,
  publicDirectory: join(import.meta.dir, 'public'),
  clientAssets: await runClientBuild(),
  isPushEndpointAllowed: isKnownPushService,
  // a push service that never answers would hold the push's slot for good
  pushTransport: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
  schedule: (delayMs, task) => {
    setTimeout(() => void task(), delayMs);
  },
  readPublicFile: async (path) => {
    const file = Bun.file(path);

    return (await file.exists()) ? file : null;
  },
  startBodyDeadline: () => AbortSignal.timeout(60_000),
  writeError: (message, error) => console.error(message, error),
  now: Date.now,
});

// loopback only: the tunnel reaches the server here, and the network around the PC never does
const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  // Bun refuses a larger body before the handler sees it; the handler holds each route to less
  maxRequestBodySize: probeLimits.shareBodyBytes + 1024 * 1024,
  fetch: answerRequest,
});

console.log(`probe app on ${server.url.href}`);
console.log(`send page: ${server.url.href}send.html?key=${adminKey}`);
