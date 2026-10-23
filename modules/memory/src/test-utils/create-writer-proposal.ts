import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import type { MemoryProposal } from '../gate-types';
import { readWriterRow } from '../read-writer-row';
import { runWriterBatch } from '../run-writer-batch';
import { writerConfigSchema } from '../writer-config-schema';
import type { WriterSubject } from '../writer-types';
import { claimWriterLease } from './claim-writer-lease';
import { createStubWriterSession } from './create-stub-writer-session';
import type { TestMemory } from './start-test-memory';
import { writePlannedBatch } from './write-planned-batch';

export interface WriterProposalRequest {
  readonly message: string;
  readonly text: string;
  readonly quote: string;

  readonly subject?: WriterSubject;
}

export async function createWriterProposal(
  memory: Pick<TestMemory, 'log' | 'store'>,
  request: WriterProposalRequest,
): Promise<MemoryProposal> {
  const context = {
    log: memory.log,
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };

  const lease = await claimWriterLease(context);
  const planned = await writePlannedBatch(memory.log, [request.message]);

  await runWriterBatch(
    {
      context,
      store: memory.store,
      publish: memory.store.writeBatch,
      gate: memory.store.writes.batch,
      config: writerConfigSchema.parse({}),
      getPersona: () => '',
      ownerName: null,
      assistantName: null,
      defaultZone: 'UTC',
      ...createStubWriterSession({
        op: 'remember',
        subject: request.subject ?? 'owner',
        text: request.text,
        quote: request.quote,
        sourceSequence: planned.bounds.end,
        itemID: null,
      }),
    },
    {
      input: {
        taskID: 'memory-writer',
        stepKey: 'step-1',
        lease,
        inbox: [],
        sessionBoundary: null,
        signal: new AbortController().signal,
      },
      row: await readWriterRow(memory.log),
      now: context.clock.now(),
    },
  );

  const pending = await memory.store.proposals.listPending();

  const proposal = pending.findLast((entry) => entry.origin === 'memory_writer');

  invariant(proposal, 'the batch made no pending proposal');

  return proposal;
}
