import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildActionHash } from '@heynixie/policy';
import { buildToolRegistry, runApprovedCall, runToolCall } from '@heynixie/tools';
import type { ToolCallOptions, ToolRun } from '@heynixie/tools';
import { buildStubActionQueue } from '@heynixie/tools/test-utils';
import { startTestDevices } from '../test-utils';
import { buildDeviceTools } from './build-device-tools';
import { writeRegion } from './write-region';

async function setupTest() {
  const ctx = await startTestDevices();

  const options = {
    log: ctx.log,
    definitions: ctx.definitions,
    clock: ctx.clock,
    streams: ctx.streams,
  };

  const tools = buildDeviceTools(options);

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: tools.map((tool) => tool.name),
    model: { model: 'model-a', profile: 'chat-direct' },
    stepRunID: 'conversation@1',
  };

  // every call asks, so the runner stores it and waits for the owner
  const toolOptions: ToolCallOptions = {
    registry: buildToolRegistry(tools),
    decide: () =>
      Promise.resolve({
        decision: {
          outcome: 'ask',
          stage: 9,
          rule: null,
          cause: 'no_rule',
          destinations: [],
          snapshot: 'sha256:test',
        },
        sentence: null,
      }),
    log: ctx.log,
    definitions: ctx.definitions,
    queue: buildStubActionQueue().queue,
    queuedWaitMs: 10_000,
  };

  return {
    ...ctx,

    // the sequence of the newest record, which a call queued now follows
    newestSequence: async () => {
      const [newest] = await readRecords(ctx.log, { afterSequence: 0, order: 'newest', limit: 1 });

      return newest?.record.sequence ?? 0;
    },

    // queues a call through the runner, as a conversation turn does, and answers how the owner's
    // approval runs it
    queue: async (tool: string, input: JSONObject) => {
      const destinations = await ctx.prepare(tool, input);

      await runToolCall({ tool, input, toolUseID: 'toolu_1' }, run, toolOptions);

      const [called] = await readRecords(ctx.log, {
        afterSequence: 0,
        kinds: ['tool_called'],
        order: 'newest',
        limit: 1,
      });

      const callSequence = called?.record.sequence ?? 0;

      return {
        approve: () =>
          runApprovedCall(
            {
              actionID: 'proposal-1',
              tool,
              input,
              callSequence,
              actionHash: buildActionHash({
                tool,
                input,
                destinations: 'destinations' in destinations ? destinations.destinations : [],
                deadlineAt: null,
              }),
            },
            run,
            toolOptions,
          ),
      };
    },

    // each region of the device's layout as devices.list shows it, by name
    readRegions: async () => {
      const listed = await ctx.call('devices.list', {});

      return listed.status === 'ok' ? listed.result : null;
    },
  };
}

test('it refuses a device that does not exist', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.call('device.region', {
    device: 'zz9plural1',
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_DEVICE' });
});

test('it refuses a screen that is off', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.device();

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'SCREEN_OFF' });
});

test('it refuses a region of a device that holds no layout', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_REGION' });
});

test('it refuses a region that the layout does not name', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'garden',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_REGION' });
});

test('it refuses a page, which a region cannot hold yet', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'page', html: '<p>ripples</p>' },
  });

  expect(outcome).toMatchObject({
    status: 'ok',
    refusalCode: 'PAGE_NOT_BUILT',
    result: { refused: 'PAGE_NOT_BUILT' },
  });
});

test('it refuses an image that is not in the store', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_IMAGE' });
});

test('it refuses an image that a forget made unreadable', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();
  const image = await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);
  await ctx.removeKey(image.sequence);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'IMAGE_FORGOTTEN' });
});

test('it refuses an offline device', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  const stream = ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  stream.close();

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'OFFLINE' });
});

test('it answers the time a region ends when its content lasts minutes', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out **tonight**' },
    minutes: 90,
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { device: device.deviceID, region: 'note', until: '2026-11-21T09:30:00.000Z' },
  });
});

test.each([
  {
    title: 'markdown',
    content: { kind: 'markdown', markdown: 'Bins go out **tonight**' },
    kind: 'markdown',
  },
  { title: 'a clock', content: { kind: 'live', live: 'clock', format: 'HH:mm' }, kind: 'live' },
  {
    title: 'a countdown with a label',
    content: {
      kind: 'live',
      live: 'countdown',
      to: '2026-12-24T18:00:00Z',
      label: 'Christmas Eve',
    },
    kind: 'live',
  },
  {
    title: 'a countdown with no label',
    content: { kind: 'live', live: 'countdown', to: '2026-12-24T18:00:00Z' },
    kind: 'live',
  },
])('it lists the region that holds $title by its kind', async (row) => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: row.content,
  });

  const listed = await ctx.readRegions();

  expect(listed).toMatchObject({
    devices: [
      {
        layout: {
          regions: [
            { name: 'pond', kind: null },
            { name: 'note', kind: row.kind, until: null, shown: expect.toBeString() },
            { name: 'clock', kind: null },
          ],
        },
      },
    ],
  });
});

test.each(['whole', 'fill'])('it fills a region with an image with the fit %s', async (fit) => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'image', image: 'k3x9m2p7qa', fit },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { device: device.deviceID, region: 'pond', until: null },
  });
});

test('it fails markdown past 20,000 characters', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'a'.repeat(20_001) },
  });

  expect(outcome.status).toBe('error');
});

test('it fails a countdown whose time is not a time', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'clock',
    content: { kind: 'live', live: 'countdown', to: 'tonight' },
  });

  expect(outcome.status).toBe('error');
});

test('it blanks a region when its minutes pass, and leaves the others showing', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'markdown', markdown: 'ripples' },
    minutes: 5,
  });

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
    minutes: 60,
  });

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'clock',
    content: { kind: 'live', live: 'clock', format: 'HH:mm' },
  });

  ctx.clock.advance(10 * 60_000);

  const listed = await ctx.readRegions();

  expect(listed).toMatchObject({
    devices: [
      {
        layout: {
          regions: [
            { name: 'pond', kind: null, until: null, shown: null },
            { name: 'note', kind: 'markdown', until: '2026-11-21T09:00:00.000Z' },
            { name: 'clock', kind: 'live', until: null },
          ],
        },
      },
    ],
  });
});

test('it shows the content a region had again when its minutes pass with then previous', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  const before = await ctx.readRegions();

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Dentist at 3' },
    minutes: 10,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  ctx.clock.advance(11 * 60_000);

  const after = await ctx.readRegions();

  expect(after).toStrictEqual(before);
});

test('it walks back through each content that asked for previous as its minutes pass', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'first' },
  });

  const first = await ctx.readRegions();

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'second' },
    minutes: 60,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  const second = await ctx.readRegions();

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'third' },
    minutes: 10,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  ctx.clock.advance(11 * 60_000);

  const afterThird = await ctx.readRegions();

  ctx.clock.advance(60 * 60_000);

  const afterSecond = await ctx.readRegions();

  expect([afterThird, afterSecond]).toStrictEqual([second, first]);
});

test('it blanks a region when the content it covered has ended too', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'first' },
    minutes: 10,
  });

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'second' },
    minutes: 30,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  ctx.clock.advance(40 * 60_000);

  const listed = await ctx.readRegions();

  expect(listed).toMatchObject({
    devices: [{ layout: { regions: [{}, { name: 'note', kind: null }, {}] } }],
  });
});

test('it blanks a region when the content it covered was forgotten', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'first' },
  });

  const first = await ctx.readLayout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'second' },
    minutes: 10,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  await ctx.removeKey(first?.regions[1]?.shown?.sequence ?? 0);

  ctx.clock.advance(11 * 60_000);

  const listed = await ctx.readRegions();

  expect(listed).toMatchObject({
    devices: [{ layout: { regions: [{}, { name: 'note', kind: null }, {}] } }],
  });
});

test('it blanks a region when a forget erases its content', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'clock',
    content: { kind: 'live', live: 'clock', format: 'HH:mm' },
  });

  const layout = await ctx.readLayout(device.deviceID);

  await ctx.removeKey(layout?.regions[1]?.shown?.sequence ?? 0);

  const listed = await ctx.readRegions();

  expect(listed).toMatchObject({
    devices: [
      {
        layout: {
          regions: [
            { name: 'pond', kind: null },
            { name: 'note', kind: null, shown: null },
            { name: 'clock', kind: 'live' },
          ],
        },
      },
    ],
  });
});

test('it blanks a region whose image a forget erased', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();
  const image = await ctx.seed.image('k3x9m2p7qa');

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'pond',
    content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
  });

  await ctx.removeKey(image.sequence);

  const listed = await ctx.readRegions();

  expect(listed).toMatchObject({
    devices: [{ layout: { regions: [{ name: 'pond', kind: null }, {}, {}] } }],
  });
});

test('it keeps the layout and the regions through a restart', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
    minutes: 60,
  });

  const before = await ctx.readLayout(device.deviceID);
  const restarted = await ctx.restart();
  const after = await restarted.readLayout(device.deviceID);
  const listed = await restarted.call('devices.list', {});

  expect(after).toStrictEqual(before);

  expect(after?.regions[1]).toMatchObject({
    name: 'note',
    shown: { untilMs: Date.parse('2026-11-21T09:00:00.000Z') },
  });

  expect(listed).toMatchObject({
    status: 'ok',
    result: { devices: [{ online: false, layout: { regions: [{}, { kind: 'markdown' }, {}] } }] },
  });
});

test('it keeps counting the minutes of a region while a show covers the layout', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
    minutes: 5,
  });

  await ctx.call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
    minutes: 60,
  });

  ctx.clock.advance(10 * 60_000);

  const listed = await ctx.readRegions();

  expect(listed).toMatchObject({
    devices: [
      {
        showing: { kind: 'markdown' },
        layout: { regions: [{}, { name: 'note', kind: null }, {}] },
      },
    ],
  });
});

test('it fails a call for a region when the layout was cleared before the call ran', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Bins go out tonight' },
  });

  await ctx.call('device.layout', { device: device.deviceID, clear: true });

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Dentist at 3' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_REGION' });
});

test('it fails a call for a region that a new layout dropped', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  const outcome = await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Dentist at 3' },
  });

  expect(outcome).toMatchObject({ status: 'ok', refusalCode: 'UNKNOWN_REGION' });
});

test('it refuses an approved call with UNKNOWN_REGION when a new layout kept the name of the region', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const queued = await ctx.queue('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Dentist at 3' },
  });

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'note', column: 1, row: 1 }],
  });

  const approved = await queued.approve();
  const layout = await ctx.readLayout(device.deviceID);

  expect(approved).toMatchObject({ status: 'refused', code: 'UNKNOWN_REGION' });
  expect(layout?.regions.map((region) => region.shown)).toStrictEqual([null]);
});

test('it fills the region when the approved call finds the layout it was queued against', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const queued = await ctx.queue('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Dentist at 3' },
  });

  const approved = await queued.approve();
  const layout = await ctx.readLayout(device.deviceID);

  expect(approved).toMatchObject({ status: 'done' });

  expect(layout?.regions.map((region) => region.shown?.content?.kind ?? null)).toStrictEqual([
    null,
    'markdown',
    null,
  ]);
});

test('it keeps a region as it is until its call is approved, and fails it when the layout is gone', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const input = {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'Dentist at 3' },
  };

  await ctx.prepare('device.region', input);

  const unchanged = await ctx.readLayout(device.deviceID);

  await ctx.call('device.layout', { device: device.deviceID, clear: true });

  const approved = await ctx.prepare('device.region', input);

  expect(unchanged?.regions.map((region) => region.shown)).toStrictEqual([null, null, null]);
  expect(approved).toMatchObject({ refusalCode: 'UNKNOWN_REGION' });
});

test('it never fills a region of a layout that replaced the one the write read', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  const callSequence = await ctx.newestSequence();

  await ctx.call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'note', column: 1, row: 1 }],
  });

  const written = await writeRegion(
    { log: ctx.log, definitions: ctx.definitions, clock: ctx.clock, streams: ctx.streams },
    {
      deviceID: device.deviceID,
      thread: 'conversation',
      callSequence,
      region: 'note',
      content: { kind: 'markdown', markdown: 'Dentist at 3' },
      untilMs: null,
      onEnd: 'blank',
    },
  );

  const layout = await ctx.readLayout(device.deviceID);

  expect(written).toBeNull();
  expect(layout?.regions.map((region) => region.shown)).toStrictEqual([null]);
});

test('it covers the content an earlier call wrote when two calls for a region run together', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'base' },
  });

  await Promise.all([
    ctx.call('device.region', {
      device: device.deviceID,
      region: 'note',
      content: { kind: 'markdown', markdown: 'first' },
      minutes: 60,
    }),
    ctx.call('device.region', {
      device: device.deviceID,
      region: 'note',
      content: { kind: 'markdown', markdown: 'second' },
      minutes: 10,
      // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
      then: 'previous',
    }),
  ]);

  ctx.clock.advance(11 * 60_000);

  const layout = await ctx.readLayout(device.deviceID);

  expect(layout?.regions[1]?.shown?.content).toStrictEqual({
    kind: 'markdown',
    markdown: 'first',
  });
});

test('it blanks a region whose forgotten update asked for previous, before and after its minutes pass', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'base' },
  });

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'second' },
    minutes: 10,
    // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
    then: 'previous',
  });

  const second = await ctx.readLayout(device.deviceID);

  await ctx.removeKey(second?.regions[1]?.shown?.sequence ?? 0);

  const beforeExpiry = await ctx.readLayout(device.deviceID);

  ctx.clock.advance(11 * 60_000);

  const afterExpiry = await ctx.readLayout(device.deviceID);

  expect([beforeExpiry?.regions[1]?.shown, afterExpiry?.regions[1]?.shown]).toStrictEqual([
    null,
    null,
  ]);
});

test('it shows a permanent value again after 50 timed updates over it expire together', async () => {
  const ctx = await setupTest();
  const device = await ctx.seed.screenOnDevice();

  ctx.streams.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  await ctx.seed.layout(device.deviceID);

  await ctx.call('device.region', {
    device: device.deviceID,
    region: 'note',
    content: { kind: 'markdown', markdown: 'base' },
  });

  for (let index = 0; index < 50; index += 1) {
    await ctx.call('device.region', {
      device: device.deviceID,
      region: 'note',
      content: { kind: 'markdown', markdown: `update ${String(index)}` },
      minutes: 1,
      // oxlint-disable-next-line unicorn/no-thenable -- the tool's input is named then
      then: 'previous',
    });
  }

  ctx.clock.advance(2 * 60_000);

  const layout = await ctx.readLayout(device.deviceID);

  expect(layout?.regions[1]?.shown?.content).toStrictEqual({
    kind: 'markdown',
    markdown: 'base',
  });
});
