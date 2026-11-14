import invariant from 'tiny-invariant';
import type { MemoryProposal } from '../gate-context';
import type { VersionRef } from '../types';
import { buildMockWriteCaller } from './build-mock-write-caller';
import type { TestMemory } from './start-test-memory';
import { writeOwnerMessageRecord } from './write-owner-message-record';

export interface QuotedProposalRequest {
  readonly message: string;
  readonly text: string;
  readonly quote: string;

  readonly target?: VersionRef;
}

export interface QuotedProposal {
  readonly proposal: MemoryProposal;

  readonly recordSequence: number;
}

export async function createQuotedProposal(
  memory: Pick<TestMemory, 'log' | 'store'>,
  request: QuotedProposalRequest,
): Promise<QuotedProposal> {
  const recordSequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: request.message,
    spans: [{ start: 0, end: request.message.length, source: 'typed' }],
  });

  const outcome = await memory.store.writes.remember({
    text: request.text,
    quote: request.quote,
    ...(request.target === undefined ? {} : { target: request.target }),
    caller: buildMockWriteCaller(),
  });

  const pending = await memory.store.proposals.listPending();

  const proposal = pending.find(
    (entry) => outcome.status === 'proposed' && entry.proposalID === outcome.proposalID,
  );

  invariant(proposal?.evidence, 'the write made no pending proposal that quotes the message');

  return { proposal, recordSequence };
}
