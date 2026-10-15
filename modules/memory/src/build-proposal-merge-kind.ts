import type { Log } from '@heynixie/log';
import type { EventKind, NotedEvent, TurnNoteRange } from '@heynixie/sessions';
import type { MemoryOrigin, MemoryTables } from './types';

// A write outside the conversation that proposed the same change as one of the conversation's
// pending proposals, and merged into it.
export interface ProposalMergeEvent {
  readonly proposalID: string;
  readonly origin: MemoryOrigin;
}

// The event kind for a write from outside the conversation that merged into one of its proposals,
// so the conversation knows its proposal still waits. A proposal that closed before the next turn
// has nothing left to wait for, so its merges are left out.
export function buildProposalMergeKind(log: Pick<Log, 'writer'>): EventKind<ProposalMergeEvent> {
  return {
    name: 'memory_merge',
    read: async (range) => {
      const rows = await readOutsideMerges(log, range);

      return rows.map((row): NotedEvent<ProposalMergeEvent> => ({
        sequence: row.sequence,
        at: row.recorded_at,
        detail: { proposalID: row.proposal_id, origin: row.origin },
      }));
    },
    render: (detail, settings) => {
      const owner = settings.ownerName ?? 'the owner';

      const proposer =
        detail.origin === 'owner'
          ? (settings.ownerName ?? 'The owner')
          : proposerWords[detail.origin];

      return `${proposer} proposed the same memory again; it merged into your pending memory proposal ${detail.proposalID}, which still waits for ${owner}'s review.`;
    },
  };
}

const proposerWords: Readonly<Record<Exclude<MemoryOrigin, 'owner'>, string>> = {
  conversation: 'Another conversation turn',
  task: 'A task',
  memory_writer: 'Your note-taker',
};

interface MergeRow {
  readonly proposal_id: string;
  readonly origin: MemoryOrigin;
  readonly sequence: number;
  readonly recorded_at: number;
}

// every merge in the range into a pending proposal the conversation made, from a write outside it
function readOutsideMerges(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange,
): Promise<readonly MergeRow[]> {
  return log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposal_merges')
    .innerJoin(
      'memory_proposals',
      'memory_proposals.proposal_id',
      'memory_proposal_merges.proposal_id',
    )
    .select([
      'memory_proposal_merges.proposal_id',
      'memory_proposal_merges.origin',
      'memory_proposal_merges.sequence',
      'memory_proposal_merges.recorded_at',
    ])
    .where('memory_proposal_merges.sequence', '>', range.after)
    .where('memory_proposal_merges.sequence', '<=', range.through)
    .where('memory_proposals.origin', '=', 'conversation')
    .where('memory_proposals.status', '=', 'pending')
    .where('memory_proposal_merges.origin', '!=', 'conversation')
    .orderBy('memory_proposal_merges.sequence')
    .execute();
}
