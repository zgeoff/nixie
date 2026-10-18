import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import type { MemoryProposal } from '../gate-types';
import { readWriterRow } from '../read-writer-row';
import { runWriterBatch } from '../run-writer-batch';
import { writerConfigSchema } from '../writer-config-schema';
import { buildStubWriterSession } from './build-stub-writer-session';
import { claimWriterLease } from './claim-writer-lease';
import type { TestMemory } from './start-test-memory';
import { writePlannedBatch } from './write-planned-batch';

export interface WriterProposalRequest {
  // the owner message the batch reads, and the memory text and quote the writer stages from it
  readonly message: string;
  readonly text: string;
  readonly quote: string;
}

// Runs one memory writer batch over the message through the store's real batch gate, which holds
// the write for review because the message has no typed span, and returns the pending proposal.
// It claims the writer's lease, so a test calls it once.
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
      ...buildStubWriterSession({
        op: 'remember',
        subject: 'owner',
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
