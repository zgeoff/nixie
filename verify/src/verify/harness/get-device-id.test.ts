import { expect, test } from 'bun:test';
import { getDeviceID } from './get-device-id';

function setupTest() {
  return {
    body: {
      messages: [
        {
          role: 'user',
          content:
            '{"devices":[{"shortID":"aaa111","name":"laptop","deviceKind":"client","onCall":false},' +
            '{"shortID":"bbb222","name":"hallway tablet","deviceKind":"client","onCall":true},' +
            '{"shortID":"ccc333","name":"hall display","deviceKind":"screen","onCall":false}]}',
        },
      ],
    },
  };
}

test('it finds a device by its name', () => {
  const ctx = setupTest();

  expect(getDeviceID(ctx.body, { name: 'hallway tablet' })).toBe('bbb222');
});

test('it finds the first screen device, not the first device listed', () => {
  const ctx = setupTest();

  expect(getDeviceID(ctx.body, { kind: 'screen' })).toBe('ccc333');
});

test('it returns an empty string for a name no device has', () => {
  const ctx = setupTest();

  expect(getDeviceID(ctx.body, { name: 'kitchen' })).toBe('');
});

test('it finds a device whose name holds quotes', () => {
  const body = {
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          devices: [
            { shortID: 'aaa111', name: 'laptop', deviceKind: 'client', onCall: false },
            { shortID: 'ddd444', name: 'the "big" screen', deviceKind: 'screen', onCall: false },
          ],
        }),
      },
    ],
  };

  expect(getDeviceID(body, { name: 'the "big" screen' })).toBe('ddd444');
});
