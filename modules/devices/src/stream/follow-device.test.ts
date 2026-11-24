import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import { removeDevice } from '../device/remove-device';
import { startTestDevices } from '../test-utils';
import { writeShow } from '../tool/write-show';
import { followDevice } from './follow-device';

async function setupTest() {
  const ctx = await startTestDevices();

  const stopped = new AbortController();

  return {
    ...ctx,
    stop: () => {
      stopped.abort();
    },
    follow: (deviceID: string) =>
      followDevice({
        log: ctx.log,
        clock: ctx.clock,
        streams: ctx.streams,
        deviceID,
        pixels: { width: 1920, height: 480, pixelRatio: 1 },
        signal: stopped.signal,
      }),
  };
}

test('#followDevice starts a device with no scene on a black screen', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  const first = await events.next();

  ctx.stop();

  expect(first).toStrictEqual({ done: false, value: { kind: 'idle', scene: [] } });
});

test('#followDevice starts a reconnecting device on the show it had', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  const events = ctx.follow(device.deviceID);

  const first = await events.next();

  ctx.stop();

  expect(first).toStrictEqual({
    done: false,
    value: { kind: 'show', content: { kind: 'markdown', text: '# Saturday' }, until: null },
  });
});

test('#followDevice sends a show that the assistant makes while the stream is open', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
    minutes: 5,
  });

  const second = await events.next();

  ctx.stop();

  expect(second).toStrictEqual({
    done: false,
    value: {
      kind: 'show',
      content: { kind: 'markdown', text: '# Saturday' },
      until: '2026-11-21T08:05:00.000Z',
    },
  });
});

test('#followDevice sends the idle scene when a show ends, and never an older show', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();

  await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'markdown', text: '# Saturday' }],
  });

  await events.next();

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: 'first' },
  });

  await events.next();

  await writeShow(
    { log: ctx.log, definitions: ctx.definitions, clock: ctx.clock, streams: ctx.streams },
    {
      deviceID: device.deviceID,
      thread: 'conversation',
      content: { kind: 'markdown', text: 'second' },
      untilMs: ctx.clock.now() + 50,
    },
  );

  const second = await events.next();

  const waiting = events.next();

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(1);
  });

  ctx.clock.advance(100);

  const third = await waiting;

  ctx.stop();

  expect([second.value, third.value]).toStrictEqual([
    {
      kind: 'show',
      content: { kind: 'markdown', text: 'second' },
      until: '2026-11-21T08:00:00.050Z',
    },
    { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
  ]);
});

test('#followDevice sends an idle scene that the assistant sets while the screen is idle', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();

  await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'markdown', text: '# Saturday' }],
  });

  const second = await events.next();

  ctx.stop();

  expect(second).toStrictEqual({
    done: false,
    value: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
  });
});

test('#followDevice shows the last scene the assistant set on an idle screen after a reconnect', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'markdown', text: 'first' }],
  });

  await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'markdown', text: '# Saturday' }],
  });

  const events = ctx.follow(device.deviceID);

  const first = await events.next();

  ctx.stop();

  expect(first).toStrictEqual({
    done: false,
    value: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
  });
});

test('#followDevice sends the idle event when the record of the show is forgotten', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  await events.next();

  const shown = await ctx.readDevice(device.identityID);

  await ctx.removeKey(shown?.shownSequence ?? 0);
  await ctx.call('devices.list', {});

  const third = await events.next();

  ctx.stop();

  expect(third).toStrictEqual({ done: false, value: { kind: 'idle', scene: [] } });
});

test('#followDevice sends the idle event when the image of the show is forgotten', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();
  const image = await ctx.seed.image('k3x9m2p7qa');

  const events = ctx.follow(device.deviceID);

  await events.next();

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'image', image: 'k3x9m2p7qa' },
  });

  await events.next();
  await ctx.removeKey(image.sequence);
  await ctx.call('devices.list', {});

  const third = await events.next();

  ctx.stop();

  expect(third).toStrictEqual({ done: false, value: { kind: 'idle', scene: [] } });
});

test('#followDevice drops a forgotten image from the idle scene and sends the scene again', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();
  const image = await ctx.seed.image('k3x9m2p7qa');

  const events = ctx.follow(device.deviceID);

  await events.next();

  await ctx.call('device.setIdle', {
    device: device.deviceID,
    scene: [
      { kind: 'markdown', text: '# Saturday' },
      { kind: 'image', image: 'k3x9m2p7qa' },
    ],
  });

  await events.next();
  await ctx.removeKey(image.sequence);
  await ctx.call('devices.list', {});

  const third = await events.next();

  ctx.stop();

  expect(third).toStrictEqual({
    done: false,
    value: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
  });
});

test('#followDevice holds the device online while the stream is open and for 60 s after it ends', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();

  const during = ctx.streams.isOnline(device.deviceID);

  ctx.stop();

  await events.next();

  ctx.clock.advance(59_000);

  const inGrace = ctx.streams.isOnline(device.deviceID);

  ctx.clock.advance(1000);

  await waitFor(() => {
    expect(ctx.streams.isOnline(device.deviceID)).toBeFalse();
  });

  expect([during, inGrace]).toStrictEqual([true, true]);
});

test('#followDevice ends when the row of the device goes', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();

  await withWriteTransaction(ctx.log.writer, (tx) => removeDevice(tx, device.identityID));

  const ended = await events.next();

  expect(ended).toStrictEqual({ done: true, value: undefined });
});

test('#followDevice sends a layout that the assistant sets while the stream is open', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();
  await ctx.seed.layout(device.deviceID);

  const second = await events.next();

  ctx.stop();

  expect(second.value).toStrictEqual({
    kind: 'layout',
    layout: {
      columns: ['1fr', '2fr', '1fr'],
      rows: ['1fr'],
      regions: [
        { name: 'pond', column: 1, row: 1, columnSpan: 1, rowSpan: 1, content: null, until: null },
        { name: 'note', column: 2, row: 1, columnSpan: 1, rowSpan: 1, content: null, until: null },
        { name: 'clock', column: 3, row: 1, columnSpan: 1, rowSpan: 1, content: null, until: null },
      ],
    },
  });
});

test('#followDevice sends the idle screen and then the layout to a device that reconnects', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  const events = ctx.follow(device.deviceID);

  const first = await events.next();
  const second = await events.next();

  ctx.stop();

  expect([first.value, second.value]).toMatchObject([
    { kind: 'idle', scene: [] },
    {
      kind: 'layout',
      layout: {
        regions: [
          { name: 'pond', content: null, until: null },
          { name: 'note', content: { kind: 'markdown', markdown: 'Bins go out tonight' } },
          { name: 'clock', content: null, until: null },
        ],
      },
    },
  ]);
});

test('#followDevice sends a region update as a layout event and no screen event', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();
  await ctx.seed.layout(device.deviceID);
  await events.next();

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'live', live: 'clock', format: 'HH:mm' },
  });

  const third = await events.next();

  ctx.stop();

  expect(third.value).toMatchObject({
    kind: 'layout',
    layout: {
      regions: [
        { name: 'pond', content: { kind: 'live', live: 'clock', format: 'HH:mm' } },
        { name: 'note', content: null },
        { name: 'clock', content: null },
      ],
    },
  });
});

test('#followDevice keeps carrying the layout while a show covers it', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();
  await ctx.seed.layout(device.deviceID);
  await events.next();

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  const show = await events.next();

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  const layout = await events.next();

  ctx.stop();

  expect([show.value, layout.value]).toMatchObject([
    { kind: 'show' },
    {
      kind: 'layout',
      layout: { regions: [{}, { name: 'note', content: { kind: 'markdown' } }, {}] },
    },
  ]);
});

test('#followDevice sends the layout again with the region blank when its minutes pass', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();
  await ctx.seed.layout(device.deviceID);
  await events.next();

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
    minutes: 1,
  });

  const shown = await events.next();

  const waiting = events.next();

  await waitFor(() => {
    expect(ctx.clock.countPending()).toBe(1);
  });

  ctx.clock.advance(60_000);

  const blanked = await waiting;

  ctx.stop();

  expect([shown.value, blanked.value]).toMatchObject([
    {
      kind: 'layout',
      layout: {
        regions: [
          { name: 'pond', content: null },
          { name: 'note', content: { kind: 'markdown' }, until: '2026-11-21T08:01:00.000Z' },
          { name: 'clock', content: null },
        ],
      },
    },
    {
      kind: 'layout',
      layout: {
        regions: [
          { name: 'pond', content: null },
          { name: 'note', content: null, until: null },
          { name: 'clock', content: null },
        ],
      },
    },
  ]);
});

test('#followDevice sends the layout again with the region blank when its content is forgotten', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();
  await ctx.seed.layout(device.deviceID);
  await events.next();

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  await events.next();

  const layout = await ctx.readLayout(device.deviceID);

  await ctx.removeKey(layout?.regions[1]?.shown?.sequence ?? 0);
  await ctx.call('devices.list', {});

  const fourth = await events.next();

  ctx.stop();

  expect(fourth.value).toMatchObject({
    kind: 'layout',
    layout: { regions: [{}, { name: 'note', content: null }, {}] },
  });
});

test('#followDevice sends a null layout when the assistant clears it', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();
  await ctx.seed.layout(device.deviceID);
  await events.next();
  await ctx.call('device.layout', { device: device.deviceID, clear: true });

  const third = await events.next();

  ctx.stop();

  expect(third).toStrictEqual({ done: false, value: { kind: 'layout', layout: null } });
});
