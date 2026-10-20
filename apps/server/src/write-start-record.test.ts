import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import { nixieVersion } from './nixie-version';
import { startTestLog } from './test-utils/start-test-log';
import { writeStartRecord } from './write-start-record';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-start-record-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  return { log, context: { log, definitions: () => ({ snapshotHash: 'sha256:test' }) } };
}

test('it records the first start with no previous version', async () => {
  const given = { tools: ['memory_search'], personaVersion: 'sha256:persona' };

  const ctx = await setupTest();

  await writeStartRecord(ctx.context, given, '0.12.0');

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['server.started'] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    {
      version: '0.12.0',
      previousVersion: null,
      given: { tools: ['memory_search'], personaVersion: 'sha256:persona' },
      changes: null,
    },
  ]);
});

test('it records the version of the start before', async () => {
  const given = { tools: ['memory_search'], personaVersion: 'sha256:persona' };

  const ctx = await setupTest();

  await writeStartRecord(ctx.context, given, '0.11.0');
  await writeStartRecord(ctx.context, given, '0.12.0');

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['server.started'] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    {
      version: '0.11.0',
      previousVersion: null,
      given: { tools: ['memory_search'], personaVersion: 'sha256:persona' },
      changes: null,
    },
    {
      version: '0.12.0',
      previousVersion: '0.11.0',
      given: { tools: ['memory_search'], personaVersion: 'sha256:persona' },
      changes: { addedTools: [], removedTools: [], isPersonaUpdated: false },
    },
  ]);
});

test("it records this build's version when the caller names none", async () => {
  const given = { tools: ['memory_search'], personaVersion: 'sha256:persona' };

  const ctx = await setupTest();

  await writeStartRecord(ctx.context, given);

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['server.started'] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    {
      version: nixieVersion,
      previousVersion: null,
      given: { tools: ['memory_search'], personaVersion: 'sha256:persona' },
      changes: null,
    },
  ]);
});

test('it records the tools added and removed by name and a changed persona', async () => {
  const ctx = await setupTest();

  await writeStartRecord(
    ctx.context,
    { tools: ['memory_search', 'web_fetch'], personaVersion: 'sha256:persona-1' },
    '0.11.0',
  );

  await writeStartRecord(
    ctx.context,
    { tools: ['web_fetch', 'memory_search', 'event_log_read'], personaVersion: 'sha256:persona-1' },
    '0.12.0',
  );

  await writeStartRecord(
    ctx.context,
    { tools: ['event_log_read', 'web_fetch'], personaVersion: 'sha256:persona-2' },
    '0.13.0',
  );

  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['server.started'] });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    {
      version: '0.11.0',
      previousVersion: null,
      given: { tools: ['memory_search', 'web_fetch'], personaVersion: 'sha256:persona-1' },
      changes: null,
    },
    {
      version: '0.12.0',
      previousVersion: '0.11.0',
      given: {
        tools: ['event_log_read', 'memory_search', 'web_fetch'],
        personaVersion: 'sha256:persona-1',
      },
      changes: { addedTools: ['event_log_read'], removedTools: [], isPersonaUpdated: false },
    },
    {
      version: '0.13.0',
      previousVersion: '0.12.0',
      given: { tools: ['event_log_read', 'web_fetch'], personaVersion: 'sha256:persona-2' },
      changes: { addedTools: [], removedTools: ['memory_search'], isPersonaUpdated: true },
    },
  ]);
});
