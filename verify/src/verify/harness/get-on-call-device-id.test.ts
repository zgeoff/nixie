import { expect, test } from 'bun:test';
import { getOnCallDeviceID } from './get-on-call-device-id';

function setupTest() {
  return {
    buildBody: (devices: string) => ({
      messages: [{ role: 'user', content: `{"devices":[${devices}]}` }],
    }),
  };
}

test('it picks the device that the list marks onCall, not the first one listed', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '{"shortID":"aaa111","name":"laptop","deviceKind":"client","onCall":false,"screen":"on"},' +
      '{"shortID":"bbb222","name":"hallway tablet","deviceKind":"client","onCall":true,"screen":"on"}',
  );

  expect(getOnCallDeviceID(body)).toBe('bbb222');
});

test('it returns an empty string when no device is onCall', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '{"shortID":"aaa111","name":"laptop","deviceKind":"client","onCall":false,"screen":"on"}',
  );

  expect(getOnCallDeviceID(body)).toBe('');
});
