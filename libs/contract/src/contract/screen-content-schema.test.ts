import { expect, test } from 'bun:test';
import { contract } from './contract';
import { screenContentSchema, screenMarkdownLimit } from './screen-content-schema';

test('it fits an image whole when the content leaves its fit out', () => {
  expect(screenContentSchema.parse({ kind: 'image', image: 'k3x9m2p7qa' })).toStrictEqual({
    kind: 'image',
    image: 'k3x9m2p7qa',
    fit: 'whole',
  });
});

test('it refuses markdown past its limit', () => {
  expect(
    screenContentSchema.safeParse({ kind: 'markdown', text: 'a'.repeat(screenMarkdownLimit + 1) })
      .success,
  ).toBeFalse();
});

test('it refuses a page, which no screen shows yet', () => {
  expect(screenContentSchema.safeParse({ kind: 'page', page: 'k3x9m2p7qa' }).success).toBeFalse();
});

test('it takes a code issue with no scope, as every earlier client sends it', () => {
  expect(
    contract.sessions.issueCode['~orpc'].inputSchema?.safeParse({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    }).success,
  ).toBeTrue();
});

test('it takes only the screen as a capability a device switches', () => {
  expect(
    contract.devices.setCapability['~orpc'].inputSchema?.safeParse({
      capability: 'camera',
      isOn: true,
    }).success,
  ).toBeFalse();
});

test('it declares a missing device session and a missing device row for each own-device call', () => {
  expect([
    contract.devices.resize['~orpc'].errorMap,
    contract.devices.setCapability['~orpc'].errorMap,
  ]).toStrictEqual([
    {
      UNAUTHORIZED: expect.anything(),
      FEATURE_OFF: expect.anything(),
      NOT_A_DEVICE: expect.anything(),
    },
    {
      UNAUTHORIZED: expect.anything(),
      FEATURE_OFF: expect.anything(),
      NOT_A_DEVICE: expect.anything(),
    },
  ]);
});

test('it declares a missing device session and a reused action ID for a device register', () => {
  expect(contract.devices.register['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'CLIENT_ACTION_ID_REUSED',
  ]);
});
