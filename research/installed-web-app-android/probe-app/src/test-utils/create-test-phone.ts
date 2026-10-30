import { z } from 'zod';
import { decryptPushPayload } from './decrypt-push-payload.ts';

const pushPayloadSchema = z.strictObject({
  pushID: z.uuid(),
  sentAt: z.number(),
  title: z.string(),
  tag: z.string(),
  silent: z.boolean(),
  renotify: z.boolean(),
  urgency: z.string(),
  approval: z.strictObject({ approvalID: z.uuid(), token: z.string() }).nullable(),
});

export interface TestPhone {
  // the Cookie header value that holds the phone's session
  cookie: string;
  readPush: (body: Uint8Array<ArrayBuffer>) => Promise<z.infer<typeof pushPayloadSchema>>;
}

// Plays the browser of one phone against the probe's handler: opens a page to get a session
// cookie, then subscribes to push at the given endpoint with a key pair of its own.
export async function createTestPhone(
  answerRequest: (request: Request) => Promise<Response>,
  endpoint: string,
): Promise<TestPhone> {
  const page = await answerRequest(new Request('http://probe.test/'));
  const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const userAgentKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const subscribed = await answerRequest(
    new Request('http://probe.test/api/subscribe', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-nixie-client': 'test' },
      body: JSON.stringify({
        endpoint,
        keys: {
          p256dh: Buffer.from(
            await crypto.subtle.exportKey('raw', userAgentKeyPair.publicKey),
          ).toString('base64url'),
          auth: Buffer.from(authSecret).toString('base64url'),
        },
      }),
    }),
  );

  if (!subscribed.ok) {
    throw new Error(`subscribe refused: ${subscribed.status} ${await subscribed.text()}`);
  }

  return {
    cookie,
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
