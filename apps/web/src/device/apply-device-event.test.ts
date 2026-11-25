import { expect, test } from 'bun:test';
import { applyDeviceEvent } from './apply-device-event';
import type { DeviceEvents } from './use-device-events';

function setupTest() {
  const start: DeviceEvents = { event: null, layout: null, messages: [], connection: 'open' };

  return { start };
}

test('#applyDeviceEvent numbers each message in the order the stream sent it', () => {
  const ctx = setupTest();

  const first = applyDeviceEvent(ctx.start, {
    kind: 'message',
    region: 'pond',
    shown: 'sh1',
    data: { ripples: 1 },
    retain: false,
  });

  const second = applyDeviceEvent(first, {
    kind: 'message',
    region: 'pond',
    shown: 'sh1',
    data: { ripples: 2 },
    retain: true,
  });

  expect(second.messages).toStrictEqual([
    { kind: 'message', region: 'pond', shown: 'sh1', data: { ripples: 1 }, retain: false, id: 1 },
    { kind: 'message', region: 'pond', shown: 'sh1', data: { ripples: 2 }, retain: true, id: 2 },
  ]);
});

test('#applyDeviceEvent keeps the 200 newest messages', () => {
  const ctx = setupTest();
  const events = Array.from({ length: 250 }, (_, index) => index);

  const after = events.reduce(
    (current, index) =>
      applyDeviceEvent(current, {
        kind: 'message',
        region: 'pond',
        shown: 'sh1',
        data: index,
        retain: false,
      }),
    ctx.start,
  );

  expect([after.messages.length, after.messages[0]?.data, after.messages.at(-1)?.id]).toStrictEqual(
    [200, 50, 250],
  );
});

test('#applyDeviceEvent keeps the messages when the layout changes', () => {
  const ctx = setupTest();

  const withMessage = applyDeviceEvent(ctx.start, {
    kind: 'message',
    region: 'pond',
    shown: 'sh1',
    data: 'x',
    retain: false,
  });

  const after = applyDeviceEvent(withMessage, { kind: 'layout', layout: null });

  expect(after.messages).toHaveLength(1);
});

test('#applyDeviceEvent keeps the screen event that a show sent', () => {
  const ctx = setupTest();
  const after = applyDeviceEvent(ctx.start, { kind: 'idle', scene: [] });

  expect(after.event).toStrictEqual({ kind: 'idle', scene: [] });
});

test('#applyDeviceEvent keeps the newest retained message of a region after 200 newer ones', () => {
  const ctx = setupTest();

  const withRetained = applyDeviceEvent(ctx.start, {
    kind: 'message',
    region: 'pond',
    shown: 'sh1',
    data: 'state',
    retain: true,
  });

  const after = Array.from({ length: 200 }, (_, index) => index).reduce(
    (current, index) =>
      applyDeviceEvent(current, {
        kind: 'message',
        region: 'note',
        shown: 'sh2',
        data: index,
        retain: false,
      }),
    withRetained,
  );

  expect([after.messages.length, after.messages[0]?.data, after.messages[0]?.retain]).toStrictEqual(
    [201, 'state', true],
  );
});
