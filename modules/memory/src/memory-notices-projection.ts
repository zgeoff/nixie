import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { buildVersionKey } from './build-version-key';
import { parseMemoryRecord } from './parse-memory-record';
import { parseProposalRecord } from './parse-proposal-record';
import type { MemoryTables } from './types';

export const memoryNoticesProjection: Projection = {
  table: 'memory_notice_entries',
  keyColumn: 'entry_key',
  fold: async (tx, record) => {
    const entry = buildNoticeEntry(record);

    if (entry === null) {
      return [];
    }

    const db = tx.$extendTables<MemoryTables>();

    const isListed = await probeProposalEntry(db, entry);

    if (isListed) {
      return [];
    }

    await writeNoticeEntry(db, record, entry);

    return [entry.entry_key];
  },
};

interface NoticeEntryValues {
  readonly entry_key: string;
  readonly notice_key: string;
  readonly item_id: string;
  readonly version: number | null;
  readonly change: MemoryTables['memory_notice_entries']['change'];
  readonly proposal_id: string | null;
}

function buildNoticeEntry(record: EnvelopeRecord): NoticeEntryValues | null {
  const version = parseMemoryRecord(record);

  if (version?.kind === 'memory.version_added' && version.noticeKey !== null) {
    return {
      entry_key: buildVersionKey(version),
      notice_key: version.noticeKey,
      item_id: version.itemID,
      version: version.version,
      change: version.change,
      proposal_id: version.proposalID,
    };
  }

  const proposal = version === null ? parseProposalRecord(record) : null;

  if (proposal?.kind === 'memory.proposal_merged' && proposal.noticeKey !== null) {
    return {
      entry_key: `merge/${proposal.mergeID}`,
      notice_key: proposal.noticeKey,
      item_id: proposal.itemID,
      version: null,
      change: 'proposed',
      proposal_id: proposal.proposalID,
    };
  }

  if (proposal?.kind === 'memory.proposed' && proposal.noticeKey !== null) {
    return {
      entry_key: `proposal/${proposal.proposalID}`,
      notice_key: proposal.noticeKey,
      item_id: proposal.itemID,
      version: null,
      change: 'proposed',
      proposal_id: proposal.proposalID,
    };
  }

  return null;
}

async function probeProposalEntry(
  db: Kysely<MemoryTables>,
  entry: NoticeEntryValues,
): Promise<boolean> {
  if (entry.change !== 'proposed' || entry.proposal_id === null) {
    return false;
  }

  const found = await db
    .selectFrom('memory_notice_entries')
    .select('entry_key')
    .where('notice_key', '=', entry.notice_key)
    .where('proposal_id', '=', entry.proposal_id)
    .executeTakeFirst();

  return found !== undefined;
}

async function writeNoticeEntry(
  db: Kysely<MemoryTables>,
  record: EnvelopeRecord,
  entry: NoticeEntryValues,
): Promise<void> {
  await db
    .insertInto('memory_notice_entries')
    .values({
      ...entry,
      thread: record.thread,
      sequence: record.sequence,
      recorded_at: record.recordedAt.getTime(),
    })
    .execute();
}
