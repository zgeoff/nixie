import { expect, mock, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { readRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildStubEncoder } from './build-stub-encoder';
import { startTestMemory } from './start-test-memory';

test('it starts a store over a log that folds the memory projections, with no record', async () => {
  const ctx = await startTestMemory();
  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(ctx.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'memory_items',
    'memory_versions',
    'memory_writer',
    'memory_proposals',
    'memory_proposal_merges',
    'memory_notice_entries',
    'memory_forgotten_evidence',
    'memory_consolidations',
    'memory_consolidation_changes',
    'moments',
    'moment_reflections',
    'moment_links',
    'moment_texts',
  ]);

  expect(records).toStrictEqual([]);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await startTestMemory();

  onTestFinished(() => {
    expect(stat(ctx.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(ctx.dataDir).toBeString();
});

test('it gives the store the definitions snapshot the test passes', async () => {
  const ctx = await startTestMemory({ definitions: () => ({ snapshotHash: 'sha256:other' }) });

  await ctx.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(records.map((entry) => entry.record.definitions)).toSatisfyAll(
    (definitions: unknown) =>
      JSON.stringify(definitions) === JSON.stringify({ snapshotHash: 'sha256:other' }),
  );
});

test('it stamps each record with the time of the log clock the test passes', async () => {
  const ctx = await startTestMemory({
    logClock: buildTestClock(Date.parse('2026-10-19T08:14:00Z')),
  });

  await ctx.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(records.map((entry) => entry.record.recordedAt)).toSatisfyAll(
    (recordedAt: Date) => recordedAt.getTime() === Date.parse('2026-10-19T08:14:00Z'),
  );
});

test('it gives the store the encoder the test passes', async () => {
  const ctx = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  expect(ctx.store.waitForSemanticIndex()).resolves.toBeTrue();
});
