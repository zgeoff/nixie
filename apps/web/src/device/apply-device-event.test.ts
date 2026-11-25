import { expect, test } from 'bun:test';
import { applyDeviceEvent } from './apply-device-event';
import type { DeviceEvents } from './use-device-events';

function setupTest() {
  const start: DeviceEvents = {
    event: null,
    layout: null,
    messages: [],
    notices: [],
    connection: 'open',
  };

  return {
    start,
    buildRegion: (shown: string) => ({
      name: 'pond',
      column: 1,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
      background: null,
      content: null,
      shown,
      until: null,
    }),
  };
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

test('#applyDeviceEvent keeps the messages of a page that the layout still shows', () => {
  const ctx = setupTest();

  const withMessage = applyDeviceEvent(ctx.start, {
    kind: 'message',
    region: 'pond',
    shown: 'sh1',
    data: 'x',
    retain: false,
  });

  const after = applyDeviceEvent(withMessage, {
    kind: 'layout',
    layout: { columns: ['1fr'], rows: ['1fr'], regions: [ctx.buildRegion('sh1')] },
  });

  expect(after.messages).toHaveLength(1);
});

test('#applyDeviceEvent leaves a page no retained state after a replacement gave it back', () => {
  const ctx = setupTest();

  const retained = applyDeviceEvent(ctx.start, {
    kind: 'message',
    region: 'pond',
    shown: 'sh1',
    data: 'old state',
    retain: true,
  });

  const replaced = applyDeviceEvent(retained, {
    kind: 'layout',
    layout: { columns: ['1fr'], rows: ['1fr'], regions: [ctx.buildRegion('sh2')] },
  });

  const restored = applyDeviceEvent(replaced, {
    kind: 'layout',
    layout: { columns: ['1fr'], rows: ['1fr'], regions: [ctx.buildRegion('sh1')] },
  });

  expect(restored.messages).toStrictEqual([]);
});

test('#applyDeviceEvent drops every message when the layout is none', () => {
  const ctx = setupTest();

  const withMessage = applyDeviceEvent(ctx.start, {
    kind: 'message',
    region: 'pond',
    shown: 'sh1',
    data: 'x',
    retain: true,
  });

  expect(applyDeviceEvent(withMessage, { kind: 'layout', layout: null }).messages).toStrictEqual(
    [],
  );
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

test('#applyDeviceEvent numbers each refresh of a declared fetch in the order the stream sent it', () => {
  const ctx = setupTest();

  const first = applyDeviceEvent(ctx.start, {
    kind: 'data',
    region: 'pond',
    shown: 'sh1',
    url: 'https://tides.example/today',
  });

  const second = applyDeviceEvent(first, {
    kind: 'data',
    region: 'pond',
    shown: 'sh1',
    url: 'https://tides.example/today',
  });

  expect(second.notices.map((notice) => notice.id)).toStrictEqual([1, 2]);
});

test('#applyDeviceEvent drops the refreshes of a region that shows other content by now', () => {
  const ctx = setupTest();

  const noticed = applyDeviceEvent(ctx.start, {
    kind: 'data',
    region: 'pond',
    shown: 'sh1',
    url: 'https://tides.example/today',
  });

  const replaced = applyDeviceEvent(noticed, {
    kind: 'layout',
    layout: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [ctx.buildRegion('sh2')],
    },
  });

  expect(replaced.notices).toStrictEqual([]);
});
