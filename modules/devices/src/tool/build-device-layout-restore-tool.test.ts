import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestDevices } from '../test-utils';

async function setupTest() {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  return { ...ctx, device };
}

test('it refuses a device that does not exist', async () => {
  const ctx = await startTestDevices();

  const outcome = await ctx.call('device.layout_restore', {
    device: 'zz9plural1',
    name: 'evening',
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a screen that is off', async () => {
  const ctx = await startTestDevices();
  const device = await ctx.seed.device();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.layout_restore', {
    device: device.deviceID,
    name: 'evening',
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'SCREEN_OFF' });
});

test('it refuses an offline device', async () => {
  const ctx = await startTestDevices();
  const device = await ctx.seed.screenOnDevice();

  const outcome = await ctx.call('device.layout_restore', {
    device: device.deviceID,
    name: 'evening',
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'OFFLINE' });
});

test('it refuses an unknown name and lists the saved names', async () => {
  const ctx = await setupTest();

  await ctx.seed.layout(ctx.device.deviceID);
  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });
  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'morning' });

  const outcome = await ctx.call('device.layout_restore', {
    device: ctx.device.deviceID,
    name: 'noon',
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    refusalCode: 'UNKNOWN_LAYOUT',
    result: {
      refused: 'UNKNOWN_LAYOUT',
      message:
        'This device has no saved layout named noon. The saved layouts are evening, morning.',
    },
  });
});

test('it restores the grid and every region content in one call', async () => {
  const ctx = await setupTest();

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr', '2fr'],
    rows: ['1fr'],
    regions: [
      { name: 'note', column: 1, row: 1, background: 'navy' },
      { name: 'clock', column: 2, row: 1 },
    ],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'clock',
    content: { kind: 'live', live: 'clock', format: 'HH:mm' },
  });

  const before = await ctx.readLayout(ctx.device.deviceID);

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });

  await ctx.call('device.layout', {
    device: ctx.device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'garden', column: 1, row: 1 }],
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'garden',
    content: { kind: 'markdown', markdown: 'Water the pots' },
  });

  const outcome = await ctx.call('device.layout_restore', {
    device: ctx.device.deviceID,
    name: 'evening',
  });

  const after = await ctx.readLayout(ctx.device.deviceID);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      device: ctx.device.deviceID,
      name: 'evening',
      regions: ['note', 'clock'],
      emptied: [],
    },
  });

  expect({ columns: after?.columns, rows: after?.rows, regions: after?.regions }).toStrictEqual({
    columns: before?.columns,
    rows: before?.rows,
    regions: before?.regions,
  });
});

test('it writes a restored record with the restore', async () => {
  const ctx = await setupTest();

  await ctx.seed.layout(ctx.device.deviceID);
  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });
  await ctx.call('device.layout_restore', { device: ctx.device.deviceID, name: 'evening' });

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['device.layout_saved', 'device.layout_restored'],
  });

  expect(records.map((found) => found.record.kind)).toStrictEqual([
    'device.layout_saved',
    'device.layout_restored',
  ]);
});

test('it leaves a region empty and names it when a forget erased its content', async () => {
  const ctx = await setupTest();

  await ctx.seed.layout(ctx.device.deviceID);

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'clock',
    content: { kind: 'live', live: 'clock', format: 'HH:mm' },
  });

  const saved = await ctx.readLayout(ctx.device.deviceID);

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });
  await ctx.forget(saved?.regions[1]?.shown?.sequence ?? 0);

  const outcome = await ctx.call('device.layout_restore', {
    device: ctx.device.deviceID,
    name: 'evening',
  });

  const after = await ctx.readLayout(ctx.device.deviceID);

  expect([
    outcome,
    after?.regions.map((region) => region.shown?.content.kind ?? null),
  ]).toStrictEqual([
    {
      status: 'ok',
      result: {
        device: ctx.device.deviceID,
        name: 'evening',
        regions: ['pond', 'note', 'clock'],
        emptied: ['note'],
      },
    },
    [null, null, 'live'],
  ]);
});

test('it restores a layout over a layout that holds the same region names', async () => {
  const ctx = await setupTest();

  await ctx.seed.layout(ctx.device.deviceID);

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'first' },
  });

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'second' },
  });

  await ctx.call('device.layout_restore', { device: ctx.device.deviceID, name: 'evening' });

  const after = await ctx.readLayout(ctx.device.deviceID);

  expect(after?.regions[1]?.shown?.content).toStrictEqual({ kind: 'markdown', markdown: 'first' });
});

test('it saves the earlier content that shows when a newer overlay ran out, and restores it', async () => {
  const ctx = await setupTest();

  await ctx.seed.layout(ctx.device.deviceID);

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'base' },
  });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'overlay' },
    minutes: 10,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  ctx.clock.advance(11 * 60_000);

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'later' },
  });

  await ctx.call('device.layout_restore', { device: ctx.device.deviceID, name: 'evening' });

  const after = await ctx.readLayout(ctx.device.deviceID);

  expect(after?.regions[1]?.shown?.content).toStrictEqual({ kind: 'markdown', markdown: 'base' });
});

test('it names a region emptied when the content under an expired overlay was forgotten', async () => {
  const ctx = await setupTest();

  await ctx.seed.layout(ctx.device.deviceID);

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'base' },
  });

  const base = await ctx.readLayout(ctx.device.deviceID);

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'overlay' },
    minutes: 10,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  await ctx.call('device.layout_save', { device: ctx.device.deviceID, name: 'evening' });
  await ctx.forget(base?.regions[1]?.shown?.sequence ?? 0);

  ctx.clock.advance(11 * 60_000);

  const outcome = await ctx.call('device.layout_restore', {
    device: ctx.device.deviceID,
    name: 'evening',
  });

  expect(outcome).toMatchObject({ status: 'ok', result: { emptied: ['note'] } });
});
