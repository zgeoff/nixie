import type { Log } from '@heynixie/log';
import type { EventKind, NotedEvent, TurnNoteRange } from '@heynixie/models';
import { conversationTaskID } from '@heynixie/tasks';
import { z } from 'zod';
import { decodeProposalText } from './decode-proposal-text';
import { findItemKey } from './find-item-key';
import type { MemoryOrigin, MemoryStore, MemoryTables } from './types';

// The owner's answer to a memory proposal, with the text it quotes, or null when none is readable.
export interface ProposalAnswerEvent {
  readonly proposalID: string;
  readonly answer: 'approved' | 'edited' | 'rejected';

  // who proposed it: the conversation's own proposal reads as "your"
  readonly origin: MemoryOrigin;
  readonly text: string | null;
}

// The event kind for the owner's answer to a memory proposal from any source, the conversation's
// own included. An approval quotes its version through recall, so a forget knows the session saw
// it; a rejection quotes only the conversation's own edit, which its session already holds.
export function buildProposalAnswerKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  store: Pick<MemoryStore, 'recall'>,
): EventKind<ProposalAnswerEvent> {
  return {
    name: 'proposal_answer',
    read: async (range) => {
      const rows = await readAnsweredProposals(log, range);
      const approved = await readApprovedTexts(
        store,
        rows.filter((row) => row.status === 'consumed'),
      );

      return Promise.all(
        rows.map(async (row) => {
          const text =
            row.status === 'consumed'
              ? (approved.get(row.proposal_id) ?? null)
              : await readRejectedText(log, row);

          return buildAnswerEvent(row, text);
        }),
      );
    },
    render: (detail, settings) => {
      const owner = settings.ownerName ?? 'The owner';
      const proposal =
        detail.origin === 'conversation'
          ? `your memory proposal ${detail.proposalID}`
          : `a memory proposal from ${proposerWords[detail.origin]} ${detail.proposalID}`;
      const line =
        detail.answer === 'edited'
          ? `${owner} approved ${proposal} with edits`
          : `${owner} ${detail.answer} ${proposal}`;

      return detail.text === null ? `${line}.` : `${line}: "${detail.text}"`;
    },
  };
}

const proposerWords: Readonly<Record<Exclude<MemoryOrigin, 'conversation'>, string>> = {
  owner: 'the owner',
  task: 'a task',
  memory_writer: 'your note-taker',
};

// mapped types, because Kysely's table map needs the index signature an interface lacks
type RecordTables = Readonly<{
  records: {
    readonly sequence: number;
    readonly recorded_at: number;
    readonly payload: string;
  };
}>;

interface AnsweredRow {
  readonly proposal_id: string;
  readonly item_id: string;
  readonly is_new_item: number;
  readonly status: string;
  readonly sealed: string;
  readonly origin: MemoryOrigin;
  readonly sequence: number;
  readonly recorded_at: number;
  readonly payload: string;

  // the item the approval wrote, which differs from the proposal's when the approval revised another
  readonly version_item_id: string | null;
  readonly version: number | null;
}

// every proposal approved or rejected in the range, with the record that answered it and the
// version an approval wrote
function readAnsweredProposals(
  log: Pick<Log, 'writer'>,
  range: TurnNoteRange,
): Promise<readonly AnsweredRow[]> {
  return log.writer.db
    .$extendTables<MemoryTables & RecordTables>()
    .selectFrom('memory_proposals')
    .innerJoin('records', 'records.sequence', 'memory_proposals.resolved_sequence')
    .leftJoin('memory_versions', 'memory_versions.proposal_id', 'memory_proposals.proposal_id')
    .select([
      'memory_proposals.proposal_id',
      'memory_proposals.item_id',
      'memory_proposals.is_new_item',
      'memory_proposals.status',
      'memory_proposals.sealed',
      'memory_proposals.origin',
      'records.sequence',
      'records.recorded_at',
      'records.payload',
      'memory_versions.item_id as version_item_id',
      'memory_versions.version',
    ])
    .where('memory_proposals.status', 'in', ['consumed', 'rejected'])
    .where('memory_proposals.resolved_sequence', '>', range.after)
    .where('memory_proposals.resolved_sequence', '<=', range.through)
    .orderBy('memory_proposals.resolved_sequence')
    .execute();
}

// Each approval's version text, through recall, which records what it delivered and leaves out an
// item that a forget has begun.
async function readApprovedTexts(
  store: Pick<MemoryStore, 'recall'>,
  rows: readonly AnsweredRow[],
): Promise<ReadonlyMap<string, string>> {
  if (rows.length === 0) {
    return new Map();
  }
  const result = await store.recall({
    itemIDs: rows.map((row) => row.version_item_id ?? row.item_id),
    includeRetired: true,
    includeHistory: true,
    limit: rows.length,
    thread: conversationTaskID,
  });
  const items = new Map(result.items.map((item) => [item.itemID, item]));

  return new Map(
    rows.flatMap((row) => {
      const version = items
        .get(row.version_item_id ?? row.item_id)
        ?.history?.find((entry) => entry.version === row.version);

      return version === undefined ? [] : [[row.proposal_id, version.text] as const];
    }),
  );
}

// The conversation's own proposed edit, which its session already holds. A new item's key goes
// with its rejection, and a proposal from another source was never the conversation's to read.
async function readRejectedText(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  row: AnsweredRow,
): Promise<string | null> {
  if (row.origin !== 'conversation' || row.is_new_item === 1) {
    return null;
  }
  const key = await findItemKey(log, row.item_id);

  if (key === null || key === undefined) {
    return null;
  }

  // a text that fails to decrypt is left unquoted, so it never stops the turn
  return decodeProposalText(key, row.proposal_id, row.sealed).then(
    (proposed) => proposed.text,
    () => null,
  );
}

const approvalPayload = z.object({ answer: z.enum(['approved', 'edited']) });

function buildAnswerEvent(row: AnsweredRow, text: string | null): NotedEvent<ProposalAnswerEvent> {
  const approval = approvalPayload.safeParse(JSON.parse(row.payload));
  const answer = row.status === 'rejected' ? 'rejected' : (approval.data?.answer ?? 'approved');

  return {
    sequence: row.sequence,
    at: row.recorded_at,
    detail: { proposalID: row.proposal_id, answer, origin: row.origin, text },
  };
}
