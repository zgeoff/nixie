import { expect, mock, test } from 'bun:test';
import { replacePushSubscription } from './replace-push-subscription.ts';

test('it unsubscribes a subscription under an old server key before it subscribes', async () => {
  const calls = mock((_name: string) => {});
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/new',
    keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
  };

  const result = await replacePushSubscription(
    {
      getSubscription: async () => ({
        options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
        unsubscribe: async () => {
          calls('unsubscribe');

          return true;
        },
      }),
      subscribe: async (options) => {
        calls(`subscribe ${options.applicationServerKey}`);

        return { toJSON: () => subscription };
      },
    },
    'BAUG',
  );

  expect(calls.mock.calls).toStrictEqual([['unsubscribe'], ['subscribe BAUG']]);
  expect(result).toStrictEqual(subscription);
});

test('it keeps a subscription under the current server key', async () => {
  const calls = mock((_name: string) => {});

  await replacePushSubscription(
    {
      getSubscription: async () => ({
        // base64url of these bytes is the current key
        options: { applicationServerKey: new Uint8Array([4, 5, 6]).buffer },
        unsubscribe: async () => {
          calls('unsubscribe');

          return true;
        },
      }),
      subscribe: async (options) => {
        calls(`subscribe ${options.applicationServerKey}`);

        return { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/same' }) };
      },
    },
    'BAUG',
  );

  expect(calls.mock.calls).toStrictEqual([['subscribe BAUG']]);
});

test('it subscribes a phone with no subscription', async () => {
  const calls = mock((_name: string) => {});

  await replacePushSubscription(
    {
      getSubscription: async () => null,
      subscribe: async (options) => {
        calls(`subscribe ${options.applicationServerKey}`);

        return { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/first' }) };
      },
    },
    'BAUG',
  );

  expect(calls.mock.calls).toStrictEqual([['subscribe BAUG']]);
});
