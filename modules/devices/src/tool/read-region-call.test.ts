import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

async function setupTest() {
  const ctx = await startTestDevices({ fetching: { allowedHosts: [] } });
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  return {
    ...ctx,
    device,
    showPage: (extra: Record<string, unknown>) =>
      ctx.call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: { kind: 'html', html: '<p>x</p>', ...extra },
      }),
  };
}

test('it asks the decision point about each host that the page declares, as a read', async () => {
  const ctx = await setupTest();

  const device = ctx.device.deviceID;

  const prepared = await ctx.prepare('device.region', {
    device,
    region: 'pond',
    content: {
      kind: 'html',
      html: '<p>x</p>',
      fetches: [
        { url: 'https://tides.example/today' },
        { url: 'https://tides.example/week' },
        { url: 'https://weather.example/now' },
      ],
    },
  });

  expect(prepared).toMatchObject({
    destinations: ['tides.example', 'weather.example'],
    effects: ['read'],
  });
});

test('it leaves a page with no fetch as it was, with no destination', async () => {
  const ctx = await setupTest();

  const prepared = await ctx.prepare('device.region', {
    device: ctx.device.deviceID,
    region: 'pond',
    content: { kind: 'html', html: '<p>x</p>' },
  });

  expect(prepared).toMatchObject({ destinations: [] });
});

test.each([
  ['a URL with credentials', 'https://user:pass@tides.example/today'],
  ['a host with no dot', 'https://intranet/today'],
  ['a private address', 'https://10.0.0.5/today'],
])('it refuses a fetch of %s', async (_title, url) => {
  const ctx = await setupTest();
  const outcome = await ctx.showPage({ fetches: [{ url }] });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'BAD_FETCH' });
});

test('it refuses a plain http URL, which the page cannot declare', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.showPage({ fetches: [{ url: 'http://tides.example/today' }] });

  expect(outcome).toMatchObject({ status: 'error' });
});

test('it refuses a fetch declared twice', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.showPage({
    fetches: [{ url: 'https://tides.example/today' }, { url: 'https://tides.example/today' }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'BAD_FETCH' });
});

test('it shows a page that names an approved package', async () => {
  const ctx = await setupTest();

  await ctx.seed.package('chart.js@4.4.6', { 'dist/chart.js': 'var Chart = 1;' });

  const outcome = await ctx.showPage({ packages: ['chart.js@4.4.6'] });
  const layout = await ctx.readLayout(ctx.device.deviceID);

  expect(outcome).toMatchObject({ status: 'ok' });

  expect(layout?.regions.find((region) => region.name === 'pond')?.shown?.content).toMatchObject({
    kind: 'html',
    packages: ['chart.js@4.4.6'],
  });
});

test('it lists the packages and the fetch URLs of a page and never its markup', async () => {
  const ctx = await setupTest();

  await ctx.seed.package('chart.js@4.4.6', { 'dist/chart.js': 'var Chart = 1;' });

  await ctx.showPage({
    html: '<script>/* secret-markup */</script>',
    packages: ['chart.js@4.4.6'],
    fetches: [{ url: 'https://tides.example/today', refreshMinutes: 30 }],
  });

  const listed = await ctx.call('devices.list', {});

  expect(JSON.stringify(listed)).not.toContain('secret-markup');
  expect(JSON.stringify(listed)).toContain('chart.js@4.4.6');
  expect(JSON.stringify(listed)).toContain('https://tides.example/today');
});
