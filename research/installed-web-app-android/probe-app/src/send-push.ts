import { buildVapidAuthorization, type VapidKeys } from './build-vapid-authorization.ts';
import { encryptPushPayload } from './encrypt-push-payload.ts';

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SendPushInput {
  subscription: PushSubscriptionRecord;
  payload: object;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
  vapidKeys: VapidKeys;
  nowMs: number;
}

// The push service's answer: 201 for a queued message, 404 or 410 for a subscription that is gone.
export async function sendPush(input: SendPushInput): Promise<number> {
  const body = await encryptPushPayload({
    plaintext: new TextEncoder().encode(JSON.stringify(input.payload)),
    userAgentPublicKey: new Uint8Array(Buffer.from(input.subscription.p256dh, 'base64url')),
    authSecret: new Uint8Array(Buffer.from(input.subscription.auth, 'base64url')),
  });
  const response = await fetch(input.subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: await buildVapidAuthorization(
        input.subscription.endpoint,
        input.vapidKeys,
        input.nowMs,
      ),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      urgency: input.urgency,
    },
    body,
  });

  await response.body?.cancel();

  return response.status;
}
