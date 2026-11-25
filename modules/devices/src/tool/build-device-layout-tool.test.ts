import { expect, test } from 'bun:test';
import { startTestDevices } from '../test-utils';

function setupTest() {
  return startTestDevices();
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call('device.layout', {
    device: 'zz9plural1',
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a screen that is off', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'SCREEN_OFF' });
});

test('it refuses a layout with overlapping regions and says which', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'note', column: 1, row: 1 },
    ],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    refusalCode: 'BAD_LAYOUT',
    result: { refused: 'BAD_LAYOUT', message: 'the regions pond and note overlap' },
  });
});

test('it refuses a clear that also sets a grid', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    clear: true,
    columns: ['1fr'],
  });

  expect(outcome).toMatchObject({ refusalCode: 'BAD_LAYOUT' });
});

test('it refuses an offline device with its screen on', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'OFFLINE' });
});

test('it names the regions of the layout it set', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr', '2fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'bin-day', column: 2, row: 1 },
    ],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { device: device.deviceID, regions: ['pond', 'bin-day'] },
  });
});

test('it keeps the layout of a device that went offline, and lists it', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const stream = ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);
  await ctx.closeStream(device.deviceID, stream);

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    result: {
      devices: [
        {
          online: false,
          showing: null,
          layout: {
            layout: expect.toBeString(),
            columns: ['1fr', '2fr', '1fr'],
            rows: ['1fr'],
            regions: [
              { name: 'pond', kind: null, until: null, shown: null },
              { name: 'note', kind: null, until: null, shown: null },
              { name: 'clock', kind: null, until: null, shown: null },
            ],
          },
        },
      ],
    },
  });
});

test('it keeps the content of each region whose name the new layout keeps, and clears the rest', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out **tonight**' },
  });

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'ripples' },
  });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'note', column: 1, row: 1 },
      { name: 'garden', column: 2, row: 1 },
    ],
  });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    result: {
      devices: [
        {
          layout: {
            regions: [
              { name: 'note', kind: 'markdown' },
              { name: 'garden', kind: null },
            ],
          },
        },
      ],
    },
  });
});

test('it blanks a region that a layout dropped when a later layout names it again', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'ripples' },
  });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'note', column: 1, row: 1 }],
  });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1 },
      { name: 'note', column: 2, row: 1 },
    ],
  });

  const listed = await ctx.call('devices.list', {});

  expect(listed).toMatchObject({
    result: { devices: [{ layout: { regions: [{ name: 'pond', kind: null }, {}] } }] },
  });
});

test('it keeps the background of each region the layout sets', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr', '1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'pond', column: 1, row: 1, background: 'teal' },
      { name: 'note', column: 2, row: 1, background: '#102030' },
    ],
  });

  const layout = await ctx.readLayout(device.deviceID);

  expect(layout?.regions.map((region) => region.background)).toStrictEqual(['teal', '#102030']);
});

test('it takes a grid of 12 columns, 12 rows and 36 regions', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: Array.from({ length: 12 }, () => '1fr'),
    rows: Array.from({ length: 12 }, () => '1fr'),
    regions: Array.from({ length: 36 }, (_unused, index) => ({
      name: `r${String(index)}`,
      column: (index % 12) + 1,
      row: Math.floor(index / 12) + 1,
    })),
  });

  expect(outcome).toMatchObject({ status: 'ok', result: { device: device.deviceID } });
});

test.each([
  { title: '13 columns', columns: 13, rows: 1, regions: 1, cap: '1 to 12 columns' },
  { title: '13 rows', columns: 1, rows: 13, regions: 1, cap: '1 to 12 rows' },
  { title: '37 regions', columns: 12, rows: 4, regions: 37, cap: 'up to 36 regions' },
])('it refuses $title and states the cap', async (row) => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout', {
    device: device.deviceID,
    columns: Array.from({ length: row.columns }, () => '1fr'),
    rows: Array.from({ length: row.rows }, () => '1fr'),
    regions: Array.from({ length: row.regions }, (_unused, index) => ({
      name: `r${String(index)}`,
      column: (index % row.columns) + 1,
      row: Math.floor(index / row.columns) + 1,
    })),
  });

  expect(outcome).toMatchObject({
    refusalCode: 'BAD_LAYOUT',
    result: { message: expect.stringContaining(row.cap) },
  });
});

test('it removes the layout when it clears one', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.layout', { device: device.deviceID, clear: true });
  const listed = await ctx.call('devices.list', {});

  expect([outcome, listed]).toMatchObject([
    { status: 'ok', result: { device: device.deviceID, regions: [] } },
    { result: { devices: [{ layout: null }] } },
  ]);
});
