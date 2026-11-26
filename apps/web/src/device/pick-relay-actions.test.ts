import { expect, test } from 'bun:test';
import { initialDeviceEvents } from './initial-device-events';
import { pickRelayActions } from './pick-relay-actions';

test.each([
  ['a join', { kind: 'join' }, true, [{ kind: 'announce' }]],
  ['a probe', { kind: 'probe' }, true, [{ kind: 'answer' }]],
  ['an answer', { kind: 'here', tab: 'b' }, true, []],
  ['a resignation', { kind: 'resign', tab: 'b' }, true, []],
  ['a join', { kind: 'join' }, false, []],
  ['a probe', { kind: 'probe' }, false, []],
  ['an answer', { kind: 'here', tab: 'b' }, false, [{ kind: 'heard' }]],
  ['a resignation', { kind: 'resign', tab: 'b' }, false, [{ kind: 'elect' }]],
] as const)(
  'it answers %s, for a tab that holds the stream: %p',
  (_title, message, isLeading, actions) => {
    expect(pickRelayActions(message, { tab: 'm', isLeading, canYield: true })).toStrictEqual(
      actions,
    );
  },
);

test('it mirrors what the holder shows, in a tab that holds no stream', () => {
  const actions = pickRelayActions(
    { kind: 'leader', tab: 'b', events: initialDeviceEvents },
    { tab: 'm', isLeading: false, canYield: true },
  );

  expect(actions).toStrictEqual([
    { kind: 'heard' },
    { kind: 'mirror', events: initialDeviceEvents },
  ]);
});

test('it gives up the stream to a holder with a smaller tab ID', () => {
  const actions = pickRelayActions(
    { kind: 'leader', tab: 'b', events: initialDeviceEvents },
    { tab: 'm', isLeading: true, canYield: true },
  );

  expect(actions).toStrictEqual([
    { kind: 'stepDown' },
    { kind: 'heard' },
    { kind: 'mirror', events: initialDeviceEvents },
  ]);
});

test('it keeps the stream and says so to a holder with a greater tab ID', () => {
  const actions = pickRelayActions(
    { kind: 'leader', tab: 'x', events: initialDeviceEvents },
    { tab: 'm', isLeading: true, canYield: true },
  );

  expect(actions).toStrictEqual([{ kind: 'announce' }]);
});

test('it keeps the stream that a browser lock granted, whatever another tab claims', () => {
  const actions = pickRelayActions(
    { kind: 'leader', tab: 'b', events: initialDeviceEvents },
    { tab: 'm', isLeading: true, canYield: false },
  );

  expect(actions).toStrictEqual([]);
});
