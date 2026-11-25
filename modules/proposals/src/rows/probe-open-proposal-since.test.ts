import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EnvelopeRecord } from '@heynixie/log';
import { logProjections, startWriter, writeRecords } from '@heynixie/log';
import { z } from 'zod';
import { buildProposalsProjection } from './build-proposals-projection';
import { probeOpenProposalSince } from './probe-open-proposal-since';
import type { ProposalChange } from './proposal-change';

interface TestProposal {
  readonly id: string;
  readonly thread: string;
  readonly taskID: string | null;
}

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-open-proposal-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      buildProposalsProjection([
        (record: EnvelopeRecord): ProposalChange | null => {
          const proposalID = z.string().parse(record.payload['proposalID']);

          if (record.kind === 'test.proposal_approved') {
            return { type: 'close', proposalID, state: 'approved', usedBy: null, answeredBy: null };
          }

          if (record.kind !== 'test.proposal_created') {
            return null;
          }

          const taskID = record.payload['taskID'];

          return {
            type: 'create',
            proposal: {
              id: proposalID,
              shortID: `P${proposalID}`,
              family: 'action',
              kind: 'action',
              riskClass: 'routine',
              actionHash: 'sha256:action',
              ruleHash: null,
              cause: 'no_rule',
              taskID: typeof taskID === 'string' ? taskID : null,
              lapsesAt: Date.UTC(2030, 0, 1),
              deadlineAt: null,
            },
          };
        },
      ]),
    ],
  };

  const writeProposal = async (proposal: TestProposal) => {
    const [record] = await writeRecords(log, [
      {
        kind: 'test.proposal_created',
        definitions: { snapshotHash: 'sha256:test' },
        thread: proposal.thread,
        payload: { proposalID: proposal.id, taskID: proposal.taskID },
      },
    ]);

    return record?.sequence ?? 0;
  };

  const approve = (proposalID: string) =>
    writeRecords(log, [
      {
        kind: 'test.proposal_approved',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: { proposalID },
      },
    ]);

  return {
    writeProposal,
    approve,
    probe: (taskID: string, afterSequence: number) =>
      probeOpenProposalSince(writer.db, { taskID, afterSequence }),
  };
}

test.each([
  ['the task asked for', { thread: 'conversation', taskID: 'call-task' }],
  ['sits on the task thread', { thread: 'call-task', taskID: null }],
])('it finds a pending proposal that %s after the sequence', async (_name, where) => {
  const ctx = await setupTest();
  const before = await ctx.writeProposal({ id: 'p0', thread: 'other', taskID: null });

  await ctx.writeProposal({ id: 'p1', ...where });

  const isOpen = await ctx.probe('call-task', before);

  expect(isOpen).toBeTrue();
});

test('it finds no proposal of the task that came before the sequence', async () => {
  const ctx = await setupTest();
  const sequence = await ctx.writeProposal({ id: 'p1', thread: 'call-task', taskID: 'call-task' });
  const isOpen = await ctx.probe('call-task', sequence);

  expect(isOpen).toBeFalse();
});

test('it finds no proposal of the task that was answered', async () => {
  const ctx = await setupTest();

  await ctx.writeProposal({ id: 'p1', thread: 'call-task', taskID: 'call-task' });
  await ctx.approve('p1');

  const isOpen = await ctx.probe('call-task', 0);

  expect(isOpen).toBeFalse();
});

test("it finds no proposal of another task's", async () => {
  const ctx = await setupTest();

  await ctx.writeProposal({ id: 'p1', thread: 'other-task', taskID: 'other-task' });

  const isOpen = await ctx.probe('call-task', 0);

  expect(isOpen).toBeFalse();
});
