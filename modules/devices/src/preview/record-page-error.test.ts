import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';
import { recordPageError } from './record-page-error';

async function setupTest() {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 800, height: 600, pixelRatio: 1 });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Ripples' },
  });

  const layout = await ctx.readLayout(device.deviceID);

  return {
    ...ctx,
    device,
    shown: layout?.regions[0]?.shown?.shownID ?? '',
    record: (region: string, shown: string) =>
      recordPageError(
        { log: ctx.log, streams: ctx.streams },
        device.deviceID,
        { region, shown, message: 'boom' },
        ctx.clock.now(),
      ),
  };
}

test('#recordPageError keeps an error for the content that its region shows', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.record('pond', ctx.shown);

  expect([
    outcome,
    ctx.streams.errors.read(ctx.device.deviceID, new Map([['pond', ctx.shown]])),
  ]).toStrictEqual([
    'recorded',
    [{ region: 'pond', shown: ctx.shown, atMs: ctx.clock.now(), message: 'boom' }],
  ]);
});

test('#recordPageError refuses an error for content that its region no longer shows', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.record('pond', 'zz9plural1');

  expect([
    outcome,
    ctx.streams.errors.read(ctx.device.deviceID, new Map([['pond', 'zz9plural1']])),
  ]).toStrictEqual(['stale', []]);
});

test('#recordPageError refuses an error for a region that the layout lacks', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.record('garden', ctx.shown);

  expect(outcome).toBe('stale');
});
