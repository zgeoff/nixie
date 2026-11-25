import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

async function setupTest() {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  const stream = ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  return {
    ...ctx,
    device,
    stream,
    fillPage: () =>
      ctx.call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: { kind: 'html', html: '<p>ripples</p>' },
      }),
  };
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call('device.sendToPage', {
    device: 'zz9plural1',
    region: 'pond',
    data: { ripples: 3 },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a region that the layout does not name', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call('device.sendToPage', {
    device: ctx.device.deviceID,
    region: 'garden',
    data: { ripples: 3 },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_REGION' });
});

test('it refuses a region that shows no page', async () => {
  const ctx = await setupTest();

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Ripples' },
  });

  const outcome = await ctx.call('device.sendToPage', {
    device: ctx.device.deviceID,
    region: 'pond',
    data: { ripples: 3 },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'NOT_A_PAGE' });
});

test('it hands a message to the open stream of the device', async () => {
  const ctx = await setupTest();

  await ctx.fillPage();

  const outcome = await ctx.call('device.sendToPage', {
    device: ctx.device.deviceID,
    region: 'pond',
    data: { ripples: 3 },
  });

  const delivered = ctx.stream.readMessages();

  expect([outcome, delivered]).toStrictEqual([
    { status: 'ok', result: { device: ctx.device.deviceID, region: 'pond', delivered: true } },
    [{ region: 'pond', shown: expect.toBeString(), data: { ripples: 3 }, retain: false }],
  ]);
});

test('it refuses an offline device and keeps a retained message for its next stream', async () => {
  const ctx = await setupTest();

  await ctx.fillPage();
  await ctx.closeStream(ctx.device.deviceID, ctx.stream);

  const outcome = await ctx.call('device.sendToPage', {
    device: ctx.device.deviceID,
    region: 'pond',
    data: { ripples: 3 },
    retain: true,
  });

  const layout = await ctx.readLayout(ctx.device.deviceID);

  const kept = ctx.streams.messages.readRetained(
    ctx.device.deviceID,
    new Map([['pond', layout?.regions[0]?.shown?.shownID ?? '']]),
  );

  expect([outcome, kept]).toMatchObject([
    { status: 'ok', refusalCode: 'OFFLINE' },
    [{ region: 'pond', data: { ripples: 3 } }],
  ]);
});

test('it keeps no message that was not retained', async () => {
  const ctx = await setupTest();

  await ctx.fillPage();
  await ctx.closeStream(ctx.device.deviceID, ctx.stream);

  await ctx.call('device.sendToPage', {
    device: ctx.device.deviceID,
    region: 'pond',
    data: { ripples: 3 },
  });

  const layout = await ctx.readLayout(ctx.device.deviceID);

  expect(
    ctx.streams.messages.readRetained(
      ctx.device.deviceID,
      new Map([['pond', layout?.regions[0]?.shown?.shownID ?? '']]),
    ),
  ).toStrictEqual([]);
});

test('it fails a message past 16 KiB', async () => {
  const ctx = await setupTest();

  await ctx.fillPage();

  const outcome = await ctx.call('device.sendToPage', {
    device: ctx.device.deviceID,
    region: 'pond',
    data: 'x'.repeat(16 * 1024),
  });

  expect(outcome).toMatchObject({ status: 'error' });
});
