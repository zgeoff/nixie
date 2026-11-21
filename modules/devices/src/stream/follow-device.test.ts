import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { removeDevice } from '../device/remove-device';
import { startTestDevices } from '../test-utils';
import { writeShow } from '../tool/write-show';
import { followDevice } from './follow-device';

async function setupTest() {
  const ctx = await startTestDevices();

  const stopped = new AbortController();

  return {
    ...ctx,
    stop: () => stopped.abort(),
    follow: (deviceID: string) =>
      followDevice({
        log: ctx.log,
        clock: ctx.clock,
        streams: ctx.streams,
        deviceID,
        pixels: { width: 1920, height: 480 },
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

  ctx.streams.open(device.deviceID, { width: 1920, height: 480 });

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

  ctx.clock.advance(100);

  const third = await events.next();

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

test('#followDevice holds the device online while the stream is open and offline after it ends', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const events = ctx.follow(device.deviceID);

  await events.next();

  const during = ctx.streams.isOnline(device.deviceID);

  ctx.stop();

  await events.next();

  expect([during, ctx.streams.isOnline(device.deviceID)]).toStrictEqual([true, false]);
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
