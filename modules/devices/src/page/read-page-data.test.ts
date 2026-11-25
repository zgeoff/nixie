import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';
import { readPageData } from './read-page-data';

async function setupTest() {
  const ctx = await startTestDevices({ fetching: { allowedHosts: ['tides.example'] } });
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: {
      kind: 'html',
      html: '<p>x</p>',
      fetches: [{ url: 'https://tides.example/today' }],
    },
  });

  const layout = await ctx.readLayout(device.deviceID);

  const shown = layout?.regions.find((region) => region.name === 'pond')?.shown?.shownID ?? '';

  return {
    ...ctx,
    device,
    shown,
    read: (url: string, withShown = shown) =>
      readPageData(
        { log: ctx.log, streams: ctx.streams, nowMs: ctx.clock.now() },
        device.deviceID,
        { region: 'pond', shown: withShown, url },
      ),
  };
}

test('#readPageData answers not declared for a URL the page did not declare', async () => {
  const ctx = await setupTest();
  const read = await ctx.read('https://other.example/today');

  expect(read).toStrictEqual({ status: 'not_declared' });
});

test('#readPageData answers stale for content that the region no longer shows', async () => {
  const ctx = await setupTest();
  const read = await ctx.read('https://tides.example/today', 'oldshown');

  expect(read).toStrictEqual({ status: 'stale' });
});

test('#readPageData answers stale once new content replaced the page', async () => {
  const ctx = await setupTest();

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'Ripples' },
  });

  const read = await ctx.read('https://tides.example/today');

  expect(read).toStrictEqual({ status: 'stale' });
});

test('#readPageData answers not ready until the fetch returned', async () => {
  const ctx = await setupTest();
  const read = await ctx.read('https://tides.example/today');

  expect(read).toStrictEqual({ status: 'not_ready' });
});
