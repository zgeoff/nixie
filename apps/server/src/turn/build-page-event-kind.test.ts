import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devicePageEventCodec } from '@heynixie/devices';
import { writeRecords } from '@heynixie/log';
import { buildEventRegistry, readEventsBlock } from '@heynixie/sessions';
import { startTestLog } from '../test-utils/start-test-log';
import { buildPageEventKind } from './build-page-event-kind';

interface PageEventFields {
  readonly name: string;
  readonly wake: boolean;
  readonly data: number | null;
}

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-page-event-kind-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  return {
    log,
    registry: buildEventRegistry([buildPageEventKind(log)]),
    writeEvent: (fields: PageEventFields) =>
      writeRecords(log, [
        {
          kind: devicePageEventCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          contentSource: 'untrusted',
          payload: devicePageEventCodec.encode({
            device: 'dk4m7q2w9x',
            deviceName: 'hall display',
            region: 'pond',
            shown: 'sh3k7m2q9x',
            name: fields.name,
            wake: fields.wake,
          }),
          erasable: { data: fields.data },
        },
      ]),
  };
}

test('it lists a page event that did not wake the conversation, with the page text fenced', async () => {
  const ctx = await setupTest();

  await ctx.writeEvent({ name: 'touched', wake: false, data: 7 });

  const block = await readEventsBlock(
    ctx.registry,
    { after: 0, through: 100 },
    { ownerName: 'Avery', timeZone: 'UTC' },
  );

  expect(block.text).toMatch(
    /· a page event from hall display, region pond\n<tool-result source="untrusted" fence="[^"]+">\n\{"name":"touched","data":7\}\n<\/tool-result fence="[^"]+">/u,
  );
});

test('it leaves out a page event that woke the conversation, which its inbox shows', async () => {
  const ctx = await setupTest();

  await ctx.writeEvent({ name: 'touched', wake: true, data: 7 });

  const block = await readEventsBlock(
    ctx.registry,
    { after: 0, through: 100 },
    { ownerName: 'Avery', timeZone: 'UTC' },
  );

  expect(block).toStrictEqual({ text: null, count: 0 });
});

test('it lists each event once, and no event past the range', async () => {
  const ctx = await setupTest();
  const [first] = await ctx.writeEvent({ name: 'first', wake: false, data: 1 });

  await ctx.writeEvent({ name: 'second', wake: false, data: 2 });

  const block = await readEventsBlock(
    ctx.registry,
    { after: 0, through: first?.sequence ?? 0 },
    { ownerName: 'Avery', timeZone: 'UTC' },
  );

  expect(block.count).toBe(1);
});
