import { type ProbeClient, buildProbeClient } from '../../client/build-probe-client.ts';
import { type PushPayload, pushPayloadSchema } from '../contract.ts';
import { decryptPushPayload } from './decrypt-push-payload.ts';

export interface TestPhone {
  // the Cookie header value that holds the phone's session
  cookie: string;
  // the probe client a page or the service worker on this phone builds
  client: ProbeClient;
  readPush: (body: Uint8Array<ArrayBuffer>) => Promise<PushPayload>;
}

// Plays the browser of one phone against the probe's handler: opens a page to get a session
// cookie, then subscribes to push at the given endpoint with a key pair of its own.
export async function createTestPhone(
  answerRequest: (request: Request) => Promise<Response>,
  endpoint: string,
): Promise<TestPhone> {
  const page = await answerRequest(new Request('http://probe.test/'));
  const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const client = buildProbeClient({
    origin: 'http://probe.test',
    headers: { cookie },
    fetch: answerRequest,
  });
  const userAgentKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  await client.subscribe({
    endpoint,
    keys: {
      p256dh: Buffer.from(await crypto.subtle.exportKey('raw', userAgentKeyPair.publicKey)).toString(
        'base64url',
      ),
      auth: Buffer.from(authSecret).toString('base64url'),
    },
  });

  return {
    cookie,
    client,
    readPush: async (body) =>
      pushPayloadSchema.parse(
        JSON.parse(
          new TextDecoder().decode(
            await decryptPushPayload({ body, userAgentKeyPair, authSecret }),
          ),
        ),
      ),
  };
}
