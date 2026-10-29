import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind, NotedEvent, TurnNoteRange } from '@heynixie/sessions';
import { conversationTaskID } from '@heynixie/tasks';
import { z } from 'zod';
import type { MemoryProposals } from './gate-types';
import type { MemoryStore, MemoryTables, ProposalOrigin, VersionRef } from './types';

export interface ProposalAnswerEvent {
  readonly proposalID: string;
  readonly answer: 'approved' | 'edited' | 'rejected';

  readonly origin: ProposalOrigin;

  readonly written: VersionRef | null;
  readonly text: string | null;

  readonly reason: string | null;
}

export type AnswerQuoteSource = Pick<MemoryStore, 'recall'> & {
  readonly proposals: Pick<MemoryProposals, 'readRejectedEdits'>;
};

const proposerWords: Readonly<Record<Exclude<ProposalOrigin, 'conversation'>, string>> = {
  owner: 'the owner',
  task: 'a task',
  memory_writer: 'your note-taker',
};

export function buildProposalAnswerKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  store: AnswerQuoteSource,
): EventKind<ProposalAnswerEvent> {
  return {
    name: 'proposal_answer',
    read: async (range) => {
      const rows = await readAnsweredProposals(log, range);
      const reasons = await readRejectionReasons(log, range, rows);

      return rows.map((row) => buildAnswerEvent(row, reasons.get(row.sequence) ?? null));
    },
    complete: async (events) => {
      const approved = await readApprovedTexts(store, events);

      return readRejectedTexts(store, approved);
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

      const quoted = detail.text === null ? `${line}.` : `${line}: "${detail.text}"`;

      return detail.reason === null ? quoted : `${quoted} Reason: "${detail.reason}".`;
    },
  };
}

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
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
  readonly status: string;
  readonly origin: ProposalOrigin;
  readonly sequence: number;
  readonly recorded_at: number;
  readonly payload: string;

  readonly version_item_id: string | null;
  readonly version: number | null;
}

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
      'memory_proposals.status',
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

async function readRejectionReasons(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  range: TurnNoteRange,
  rows: readonly AnsweredRow[],
): Promise<ReadonlyMap<number, string>> {
  const rejections = rows.filter((row) => row.status === 'rejected').length;

  if (rejections === 0) {
    return new Map();
  }

  const records = await readRecords(log, {
    afterSequence: range.after,
    beforeSequence: range.through + 1,
    kinds: ['memory.proposal_rejected'],
    limit: rejections,
  });

  return new Map(
    records.flatMap((entry) => {
      const erasable = entry.record.erasable;
      const reason = erasable.status === 'readable' ? erasable.fields['reason'] : undefined;

      return typeof reason === 'string' ? [[entry.record.sequence, reason] as const] : [];
    }),
  );
}

const approvalPayload = z.object({ answer: z.enum(['approved', 'edited']) });

function buildAnswerEvent(
  row: AnsweredRow,
  reason: string | null,
): NotedEvent<ProposalAnswerEvent> {
  const approval = approvalPayload.safeParse(JSON.parse(row.payload));
  const answer = row.status === 'rejected' ? 'rejected' : (approval.data?.answer ?? 'approved');

  return {
    sequence: row.sequence,
    at: row.recorded_at,
    detail: {
      proposalID: row.proposal_id,
      answer,
      origin: row.origin,
      written: buildWrittenVersion(row),
      text: null,
      reason,
    },
  };
}

function buildWrittenVersion(row: AnsweredRow): VersionRef | null {
  return row.status === 'consumed' && row.version !== null
    ? { itemID: row.version_item_id ?? row.item_id, version: row.version }
    : null;
}

async function readApprovedTexts(
  store: Pick<MemoryStore, 'recall'>,
  events: readonly NotedEvent<ProposalAnswerEvent>[],
): Promise<readonly NotedEvent<ProposalAnswerEvent>[]> {
  const versions = events.flatMap((event) =>
    event.detail.written === null ? [] : [event.detail.written],
  );

  if (versions.length === 0) {
    return events;
  }

  const result = await store.recall({
    versions,
    includeRetired: true,
    limit: versions.length,
    thread: conversationTaskID,
    isTurnNote: true,
    excludeSensitive: true,
  });

  const texts = new Map(
    result.items.map((item) => [`${item.itemID}@${String(item.version)}`, item.text]),
  );

  return events.map((event) => {
    const written = event.detail.written;

    const text =
      written === null ? undefined : texts.get(`${written.itemID}@${String(written.version)}`);

    return text === undefined ? event : { ...event, detail: { ...event.detail, text } };
  });
}

async function readRejectedTexts(
  store: AnswerQuoteSource,
  events: readonly NotedEvent<ProposalAnswerEvent>[],
): Promise<readonly NotedEvent<ProposalAnswerEvent>[]> {
  const texts = await store.proposals.readRejectedEdits(
    events.flatMap((event) =>
      event.detail.answer === 'rejected' ? [event.detail.proposalID] : [],
    ),
  );

  return events.map((event) => {
    const text =
      event.detail.answer === 'rejected' ? texts.get(event.detail.proposalID) : undefined;

    return text === undefined ? event : { ...event, detail: { ...event.detail, text } };
  });
}
