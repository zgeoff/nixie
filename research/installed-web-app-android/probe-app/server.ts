import { join } from 'node:path';
import { isKnownPushService } from './src/is-known-push-service.ts';
import { makeProbeHandler } from './src/make-probe-handler.ts';
import { openVapidKeys } from './src/open-vapid-keys.ts';

const port = Number(process.env['PORT'] ?? 8787);
const adminKey = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');
const answerRequest = makeProbeHandler({
  vapidKeys: await openVapidKeys(join(import.meta.dir, '.vapid')),
  adminKey,
  publicDirectory: join(import.meta.dir, 'public'),
  isPushEndpointAllowed: isKnownPushService,
  now: Date.now,
});

// loopback only: the tunnel reaches the server here, and the network around the PC never does
const server = Bun.serve({ hostname: '127.0.0.1', port, fetch: answerRequest });

console.log(`probe app on ${server.url.href}`);
console.log(`send page: ${server.url.href}send.html?key=${adminKey}`);
