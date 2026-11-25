import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readPageData } from '../page/read-page-data';
import { startTestDevices } from '../test-utils';
import { runFetchPass } from './run-fetch-pass';
import type { FetchSchedule } from './types';

async function setupTest() {
  const ctx = await startTestDevices({ fetching: { allowedHosts: ['tides.example'] } });
  const device = await ctx.seed.screenOnDevice();

  const size = { width: 1920, height: 480, pixelRatio: 1 };
  const stream = { current: ctx.streams.open(device.deviceID, size) };

  await ctx.seed.layout(device.deviceID);

  // the runner's schedules, which outlive each pass as they do in the loop
  const schedules = new Map<string, FetchSchedule>();

  const readShown = async () => {
    const layout = await ctx.readLayout(device.deviceID);

    return layout?.regions.find((region) => region.name === 'pond')?.shown;
  };

  return {
    ...ctx,
    device,
    runPass: () =>
      runFetchPass(
        {
          log: ctx.log,
          clock: ctx.clock,
          streams: ctx.streams,
          fetching: ctx.site.fetching,
          onFailure: (error) => {
            throw error;
          },
        },
        schedules,
      ),
    showPage: (urls: readonly string[], refreshMinutes?: number) =>
      ctx.call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: {
          kind: 'html',
          html: '<p>tides</p>',
          fetches: urls.map((url) =>
            refreshMinutes === undefined ? { url } : { url, refreshMinutes },
          ),
        },
      }),
    showPageForMinutes: (url: string, minutes: number) =>
      ctx.call('device.region', {
        device: device.deviceID,
        region: 'pond',
        minutes,
        content: { kind: 'html', html: '<p>tides</p>', fetches: [{ url }] },
      }),
    showPlainPage: () =>
      ctx.call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: { kind: 'html', html: '<p>plain</p>' },
      }),
    readShown,
    readData: async (url: string) => {
      const shown = await readShown();

      return readPageData(
        { log: ctx.log, streams: ctx.streams, nowMs: ctx.clock.now() },
        device.deviceID,
        { region: 'pond', shown: shown?.shownID ?? '', url },
      );
    },

    // the device loses its connection for longer than it stays online without one
    goOffline: () => {
      stream.current.close();
      ctx.clock.advance(10 * 60_000);
    },
    comeBack: () => {
      stream.current = ctx.streams.open(device.deviceID, size);
    },
  };
}

test('#runFetchPass fetches a one-shot declaration once, though the device was offline for a pass', async () => {
  const ctx = await setupTest();

  const url = 'https://tides.example/today';

  ctx.site.addPage(url, '{"high":"14:05"}');

  await ctx.showPage([url]);
  await ctx.runPass();

  ctx.goOffline();

  await ctx.runPass();

  ctx.comeBack();

  await ctx.runPass();

  expect(ctx.site.requests).toStrictEqual([url]);
});

test('#runFetchPass asks the rules before the fetch of a device that came back, as it does for every fetch after the first', async () => {
  const ctx = await setupTest();

  const url = 'https://tides.example/today';

  ctx.site.addPage(url, '{"high":"14:05"}');

  await ctx.showPage([url], 10);
  await ctx.runPass();

  ctx.goOffline();

  await ctx.runPass();

  ctx.site.forbidHost('tides.example');
  ctx.comeBack();

  await ctx.runPass();

  const data = await ctx.readData(url);

  expect(ctx.site.requests).toStrictEqual([url]);
  expect(data).toStrictEqual({ status: 'refused' });
});

test('#runFetchPass starts no further fetch of a page that a call replaced while an earlier fetch ran', async () => {
  const ctx = await setupTest();

  const first = 'https://tides.example/first';
  const second = 'https://tides.example/second';

  ctx.site.addPage(first, '{}');
  ctx.site.addPage(second, '{}');

  ctx.site.holdRequest(first, async () => {
    await ctx.showPlainPage();
  });

  await ctx.showPage([first, second]);
  await ctx.runPass();

  expect(ctx.site.requests).toStrictEqual([first]);
});

test('#runFetchPass starts no further fetch of a page that a forget erased while an earlier fetch ran', async () => {
  const ctx = await setupTest();

  const first = 'https://tides.example/first';
  const second = 'https://tides.example/second';

  ctx.site.addPage(first, '{}');
  ctx.site.addPage(second, '{}');

  await ctx.showPage([first, second]);

  const shown = await ctx.readShown();

  ctx.site.holdRequest(first, async () => {
    await ctx.forget(shown?.sequence ?? 0);
  });

  await ctx.runPass();

  expect(ctx.site.requests).toStrictEqual([first]);
});

test('#runFetchPass drops what a page held once its minutes passed', async () => {
  const ctx = await setupTest();

  const url = 'https://tides.example/today';

  ctx.site.addPage(url, '{"high":"14:05"}');

  await ctx.showPageForMinutes(url, 30);
  await ctx.runPass();

  const held = ctx.streams.fetches.readRegions();

  ctx.clock.advance(31 * 60_000);

  await ctx.runPass();

  expect(held).toHaveLength(1);
  expect(ctx.streams.fetches.readRegions()).toStrictEqual([]);
});

test('#runFetchPass drops what a page held once a forget erased the page', async () => {
  const ctx = await setupTest();

  const url = 'https://tides.example/today';

  ctx.site.addPage(url, '{"high":"14:05"}');

  await ctx.showPage([url]);
  await ctx.runPass();

  const shown = await ctx.readShown();

  await ctx.forget(shown?.sequence ?? 0);
  await ctx.runPass();

  expect(ctx.streams.fetches.readRegions()).toStrictEqual([]);
});

test('#runFetchPass keeps what a page held while the page still shows', async () => {
  const ctx = await setupTest();

  const url = 'https://tides.example/today';

  ctx.site.addPage(url, '{"high":"14:05"}');

  await ctx.showPage([url]);
  await ctx.runPass();
  await ctx.runPass();

  const shown = await ctx.readShown();

  invariant(shown, 'the page shows');

  expect(ctx.streams.fetches.readRegions()).toStrictEqual([
    { deviceID: ctx.device.deviceID, region: 'pond', shown: shown.shownID },
  ]);
});
