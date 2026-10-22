import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineRecordCodec, readRecords, startWriter } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { z } from 'zod';
import { writeProposalLapses } from './write-proposal-lapses';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-proposal-lapses-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return { log: { writer, deploymentKey, projections: [] } };
}

test('it lapses a pending proposal 14 days old under the lapsed kind, and keeps a younger one pending', async () => {
  const ctx = await setupTest();

  const lapsedCodec = defineRecordCodec(
    'test.proposal_lapsed',
    z.object({ proposalID: z.string() }),
  );

  const olderAt = Date.UTC(2026, 4, 11, 8, 0);

  const lapsed = await writeProposalLapses(
    {
      log: ctx.log,
      clock: buildTestClock(olderAt + 14 * 24 * 60 * 60 * 1000),
      definitions: () => ({ snapshotHash: 'snapshot-c' }),
    },
    {
      readProposals: () =>
        Promise.resolve([
          { proposalID: 'r4t8v2b6nq', thread: 'conversation', proposedAt: olderAt, outcome: null },
          {
            proposalID: 'h7j3k9m1wx',
            thread: 'conversation',
            proposedAt: olderAt + 1,
            outcome: null,
          },
        ]),
      lapsedCodec,
    },
  );

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(lapsed).toBe(1);

  expect(records.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'test.proposal_lapsed',
      definitions: { snapshotHash: 'snapshot-c' },
      thread: 'conversation',
      payload: { proposalID: 'r4t8v2b6nq' },
    },
  ]);
});

test('it lapses a proposal with no thread without a thread', async () => {
  const ctx = await setupTest();

  const lapsedCodec = defineRecordCodec(
    'test.proposal_lapsed',
    z.object({ proposalID: z.string() }),
  );

  const proposedAt = Date.UTC(2026, 4, 11, 8, 0);

  await writeProposalLapses(
    {
      log: ctx.log,
      clock: buildTestClock(proposedAt + 20 * 24 * 60 * 60 * 1000),
      definitions: () => ({ snapshotHash: 'snapshot-c' }),
    },
    {
      readProposals: () =>
        Promise.resolve([{ proposalID: 'r4t8v2b6nq', thread: null, proposedAt, outcome: null }]),
      lapsedCodec,
    },
  );

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(records.map((entry) => entry.record)).toMatchObject([
    { kind: 'test.proposal_lapsed', thread: null, payload: { proposalID: 'r4t8v2b6nq' } },
  ]);
});

test('it lapses no proposal that an answer or a lapse closed', async () => {
  const ctx = await setupTest();

  const lapsedCodec = defineRecordCodec(
    'test.proposal_lapsed',
    z.object({ proposalID: z.string() }),
  );

  const proposedAt = Date.UTC(2026, 4, 11, 8, 0);

  const lapsed = await writeProposalLapses(
    {
      log: ctx.log,
      clock: buildTestClock(proposedAt + 30 * 24 * 60 * 60 * 1000),
      definitions: () => ({ snapshotHash: 'snapshot-c' }),
    },
    {
      readProposals: () =>
        Promise.resolve([
          { proposalID: 'a1s2d3f4gh', thread: 'conversation', proposedAt, outcome: 'approved' },
          { proposalID: 'z9x8c7v6bn', thread: 'conversation', proposedAt, outcome: 'rejected' },
          { proposalID: 'q5w4e3r2ty', thread: 'conversation', proposedAt, outcome: 'lapsed' },
        ]),
      lapsedCodec,
    },
  );

  const records = await readRecords(ctx.log, { afterSequence: 0 });

  expect(lapsed).toBe(0);
  expect(records).toStrictEqual([]);
});
