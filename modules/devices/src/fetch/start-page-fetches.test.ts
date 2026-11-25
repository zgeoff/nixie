import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { readPageData } from '../page/read-page-data';
import { startTestDevices } from '../test-utils';
import { startPageFetches } from './start-page-fetches';

async function setupTest() {
  const ctx = await startTestDevices({ fetching: { allowedHosts: ['tides.example'] } });
  const device = await ctx.seed.screenOnDevice();

  const url = 'https://tides.example/today';

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  // starts the runner, as the server does once it is up
  const start = () => {
    const stop = startPageFetches({
      log: ctx.log,
      clock: ctx.clock,
      streams: ctx.streams,
      fetching: ctx.site.fetching,
      onFailure: (error) => {
        throw error;
      },
    });

    onTestFinished(stop);
  };

  const readShown = async () => {
    const layout = await ctx.readLayout(device.deviceID);

    return layout?.regions.find((region) => region.name === 'pond')?.shown?.shownID ?? '';
  };

  const readData = async () => {
    const shown = await readShown();

    return readPageData(
      { log: ctx.log, streams: ctx.streams, nowMs: ctx.clock.now() },
      device.deviceID,
      { region: 'pond', shown, url },
    );
  };

  const readDataStatus = async () => {
    const data = await readData();

    return data.status;
  };

  return {
    ...ctx,
    device,
    url,
    readShown,
    readData,
    readDataStatus,
    start,
    showPage: (refreshMinutes: number) =>
      ctx.call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: { kind: 'html', html: '<p>tides</p>', fetches: [{ url, refreshMinutes }] },
      }),
  };
}

test('it fetches the declared URL once the page shows, and hands the response to the page', async () => {
  const ctx = await setupTest();

  ctx.start();
  ctx.site.addPage(ctx.url, '{"high":"14:05"}');

  await ctx.showPage(30);

  await waitForCondition(async () => (await ctx.readDataStatus()) === 'ok');

  const data = await ctx.readData();

  expect(data).toMatchObject({
    status: 'ok',
    response: { status: 200, type: 'application/json', body: '{"high":"14:05"}' },
  });
});

test('it answers not ready while the first fetch has returned nothing', async () => {
  const ctx = await setupTest();

  await ctx.showPage(30);

  const data = await ctx.readData();

  expect(data).toStrictEqual({ status: 'not_ready' });
});

test('it fetches again after the refresh minutes, and tells the open stream', async () => {
  const ctx = await setupTest();

  const stream = ctx.streams.open(ctx.device.deviceID, { width: 1, height: 1, pixelRatio: 1 });

  ctx.start();
  ctx.site.addPage(ctx.url, '{"high":"14:05"}');

  await ctx.showPage(10);

  await waitForCondition(() => ctx.site.requests.length === 1);

  ctx.site.addPage(ctx.url, '{"high":"15:40"}');
  ctx.clock.advance(10 * 60_000);

  await waitForCondition(() => ctx.site.requests.length === 2);

  const data = await ctx.readData();

  expect(data).toMatchObject({ response: { body: '{"high":"15:40"}' } });
  expect(stream.readNotices().length).toBeGreaterThanOrEqual(2);
});

test('it never runs a refresh once the rules stopped allowing the host', async () => {
  const ctx = await setupTest();

  ctx.start();
  ctx.site.addPage(ctx.url, '{"high":"14:05"}');

  await ctx.showPage(10);

  await waitForCondition(() => ctx.site.requests.length === 1);

  ctx.site.forbidHost('tides.example');
  ctx.clock.advance(10 * 60_000);

  await waitForCondition(async () => (await ctx.readDataStatus()) === 'refused');

  expect(ctx.site.requests).toStrictEqual([ctx.url]);
});

test('it reports the refusal of a fetch as a page error, so device.preview shows it', async () => {
  const ctx = await setupTest();

  ctx.start();
  ctx.site.addPage(ctx.url, '{}');

  await ctx.showPage(10);

  await waitForCondition(() => ctx.site.requests.length === 1);

  ctx.site.forbidHost('tides.example');
  ctx.clock.advance(10 * 60_000);

  await waitForCondition(async () => (await ctx.readDataStatus()) === 'refused');

  const shown = await ctx.readShown();

  const errors = ctx.streams.errors.read(ctx.device.deviceID, new Map([['pond', shown]]));

  expect(errors).toMatchObject([
    { region: 'pond', message: expect.stringContaining('was refused') },
  ]);
});

test('it checks the rules before the first fetch of a page that a restart brought back', async () => {
  const ctx = await setupTest();

  ctx.site.forbidHost('tides.example');
  ctx.site.addPage(ctx.url, '{}');

  await ctx.showPage(10);

  // a restart drops what the streams held, and with it the call's own decision of the fetch
  ctx.streams.fetches.remove(ctx.device.deviceID, 'pond');
  ctx.start();

  await waitForCondition(async () => (await ctx.readDataStatus()) === 'refused');

  expect(ctx.site.requests).toStrictEqual([]);
});

test('it ends a fetch that redirects to another host', async () => {
  const ctx = await setupTest();

  ctx.start();
  ctx.site.addRedirect(ctx.url, 'https://elsewhere.example/today');

  await ctx.showPage(10);

  await waitForCondition(async () => (await ctx.readDataStatus()) === 'refused');

  const data = await ctx.readData();

  expect(data).toStrictEqual({ status: 'refused' });
});
