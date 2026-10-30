import { onTestFinished } from 'bun:test';
import { join } from 'node:path';
import { makeProbeHandler } from '../make-probe-handler.ts';

export interface TestProbe {
  answerRequest: (request: Request) => Promise<Response>;
  // the push endpoint on a local stand-in for the push service, which accepts every push
  endpoint: string;
  // each push body the stand-in received, in order
  pushBodies: Uint8Array<ArrayBuffer>[];
}

// Wires the probe's handler to a local push service for a test of the browser code, and stops the
// push service when the test ends.
export async function createTestProbe(): Promise<TestProbe> {
  const pushBodies: Uint8Array<ArrayBuffer>[] = [];
  const pushService = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      pushBodies.push(new Uint8Array(await request.arrayBuffer()));

      return new Response(null, { status: 201 });
    },
  });

  onTestFinished(() => pushService.stop(true));

  const vapidPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  return {
    answerRequest: makeProbeHandler({
      vapidKeys: {
        privateKey: vapidPair.privateKey,
        publicKey: Buffer.from(await crypto.subtle.exportKey('raw', vapidPair.publicKey)).toString(
          'base64url',
        ),
      },
      adminKey: 'test-admin-key',
      publicDirectory: join(import.meta.dir, '..', '..', 'public'),
      clientAssets: new Map(),
      isPushEndpointAllowed: (endpoint) => endpoint.origin === pushService.url.origin,
      pushTransport: (url, init) => fetch(url, init),
      schedule: () => {},
      readPublicFile: async (path) => {
        const file = Bun.file(path);

        return (await file.exists()) ? file : null;
      },
      now: Date.now,
    }),
    endpoint: new URL('/push/phone', pushService.url).href,
    pushBodies,
  };
}
