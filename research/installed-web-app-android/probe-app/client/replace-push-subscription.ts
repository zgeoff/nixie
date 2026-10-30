// The part of PushManager that subscribing uses.
export interface SubscribingPushManager {
  getSubscription: () => Promise<{
    options: { applicationServerKey: ArrayBuffer | null };
    unsubscribe: () => Promise<boolean>;
  } | null>;
  subscribe: (options: {
    userVisibleOnly: true;
    applicationServerKey: string;
  }) => Promise<{ toJSON: () => PushSubscriptionJSON }>;
}

// Subscribes under the server's current key. A subscription made under another key, such as one
// from before the key folder was deleted, makes subscribe() fail, so it goes first.
export async function replacePushSubscription(
  pushManager: SubscribingPushManager,
  serverKey: string,
): Promise<PushSubscriptionJSON> {
  const existing = await pushManager.getSubscription();
  const existingKey = existing?.options.applicationServerKey ?? null;

  if (existing !== null && existingKey !== null && toBase64URL(existingKey) !== serverKey) {
    await existing.unsubscribe();
  }

  const subscription = await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey,
  });

  return subscription.toJSON();
}

function toBase64URL(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
