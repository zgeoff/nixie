import { expect, test } from 'bun:test';
import type { RecordInput, WriteTransaction } from '@heynixie/log';
import { readRecords, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestDevices } from '../test-utils';
import { recordPageEvent } from './record-page-event';

interface PageSend {
  readonly name: string;
  readonly wake: boolean;
  readonly shown?: string;
  readonly region?: string;
  readonly data?: number;
}

async function setupTest() {
  const ctx = await startTestDevices();
  const seeded = await ctx.seed.screenOnDevice();
  const read = await ctx.readDevice(seeded.identityID);

  invariant(read, 'the seeded device has a row');

  const device = read;

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'html', html: '<p>ripples</p>' },
  });

  const layout = await ctx.readLayout(device.deviceID);

  const dropped: string[] = [];

  const sink = {
    log: ctx.log,
    definitions: ctx.definitions,
    clock: ctx.clock,
    streams: ctx.streams,
    thread: 'conversation',
    writeEvent: async (tx: WriteTransaction, input: RecordInput) => {
      await writeRecordsInTransaction(tx, ctx.log, [input]);
    },
    onDrop: (reason: string, region: string) => {
      dropped.push(`${reason}:${region}`);
    },
  };

  const [pond] = layout?.regions ?? [];

  return {
    ...ctx,
    device,
    dropped,
    shown: pond?.shown?.shownID ?? '',
    send: (report: PageSend) =>
      recordPageEvent(
        sink,
        { ...device },
        {
          region: report.region ?? 'pond',
          shown: report.shown ?? pond?.shown?.shownID ?? '',
          name: report.name,
          wake: report.wake,
          ...(report.data === undefined ? {} : { data: report.data }),
        },
      ),
    readEvents: async () => {
      const found = await readRecords(ctx.log, { afterSequence: 0, kinds: ['device.page_event'] });

      return found.map((entry) => entry.record);
    },
    sendWithScreenOff: () =>
      recordPageEvent(
        sink,
        { ...device, capabilities: { ...device.capabilities, screen: false } },
        { region: 'pond', shown: pond?.shown?.shownID ?? '', name: 'touched', wake: false },
      ),
  };
}

test('#recordPageEvent writes the event on the conversation thread, with its data erasable', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.send({ name: 'touched', wake: false, data: 7 });
  const [event] = await ctx.readEvents();

  expect([outcome, event?.thread, event?.payload, event?.erasable]).toStrictEqual([
    'recorded',
    'conversation',
    {
      device: ctx.device.deviceID,
      deviceName: 'desk panel',
      region: 'pond',
      shown: ctx.shown,
      name: 'touched',
      wake: false,
    },
    { status: 'readable', fields: { data: 7 } },
  ]);
});

test('#recordPageEvent marks the record as content from outside', async () => {
  const ctx = await setupTest();

  await ctx.send({ name: 'touched', wake: false });

  const [event] = await ctx.readEvents();

  expect(event?.contentSource).toBe('untrusted');
});

test('#recordPageEvent says stale for content that the region no longer shows', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.send({ name: 'touched', wake: false, shown: 'zz9other' });
  const events = await ctx.readEvents();

  expect([outcome, events]).toStrictEqual(['stale', []]);
});

test('#recordPageEvent says stale for a region that shows no page', async () => {
  const ctx = await setupTest();

  await ctx.call('device.region', {
    device: ctx.device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  const layout = await ctx.readLayout(ctx.device.deviceID);

  const note = layout?.regions.find((region) => region.name === 'note');

  const outcome = await ctx.send({
    name: 'touched',
    wake: false,
    region: 'note',
    shown: note?.shown?.shownID ?? '',
  });

  expect(outcome).toBe('stale');
});

test('#recordPageEvent drops a second event inside a second, writes a line, and keeps nothing', async () => {
  const ctx = await setupTest();

  await ctx.send({ name: 'first', wake: false });

  const outcome = await ctx.send({ name: 'second', wake: false });
  const events = await ctx.readEvents();

  expect([outcome, ctx.dropped, events]).toMatchObject([
    'dropped',
    ['region_rate:pond'],
    [{ payload: { name: 'first' } }],
  ]);
});

test('#recordPageEvent keeps the wake of an event while the device has woken the conversation under 6 times in the hour', async () => {
  const ctx = await setupTest();

  await ctx.send({ name: 'touched', wake: true });

  const [event] = await ctx.readEvents();

  expect(event?.payload['wake']).toBe(true);
});

test('#recordPageEvent writes the 7th wake of an hour without its wake', async () => {
  const ctx = await setupTest();

  for (let count = 0; count < 7; count += 1) {
    await ctx.send({ name: `touch-${String(count)}`, wake: true });

    ctx.clock.advance(2000);
  }

  const events = await ctx.readEvents();

  const wakes = events.map((event) => event.payload['wake']);

  expect(wakes).toStrictEqual([true, true, true, true, true, true, false]);
});

test('#recordPageEvent lets the device wake again an hour after its sixth wake', async () => {
  const ctx = await setupTest();

  for (let count = 0; count < 6; count += 1) {
    await ctx.send({ name: `touch-${String(count)}`, wake: true });

    ctx.clock.advance(2000);
  }

  ctx.clock.advance(3_600_000);

  await ctx.send({ name: 'later', wake: true });

  const events = await ctx.readEvents();

  const wakes = events.map((event) => event.payload['wake']);

  expect(wakes.at(-1)).toBe(true);
});

test('#recordPageEvent says stale when the screen is off', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.sendWithScreenOff();
  const events = await ctx.readEvents();

  expect([outcome, events]).toStrictEqual(['stale', []]);
});
