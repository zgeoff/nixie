import type { Log } from '@heynixie/log';
import type { EventKind, NotedEvent, TurnNoteRange } from '@heynixie/sessions';
import type { MemoryOrigin, MemoryTables } from './types';

export interface ProposalMergeEvent {
  readonly proposalID: string;
  readonly origin: MemoryOrigin;
}

const proposerWords: Readonly<Record<Exclude<MemoryOrigin, 'owner'>, string>> = {
  conversation: 'Another conversation turn',
  task: 'A task',
  memory_writer: 'Your note-taker',
};

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

interface MergeRow {
  readonly proposal_id: string;
  readonly origin: MemoryOrigin;
  readonly sequence: number;
  readonly recorded_at: number;
}

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
