import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { buildPurgeKey } from '../item-key/build-purge-key';
import type { MemoryItemRow, MemoryTables, MemoryVersionRow, PurgeRequest } from '../types';
import { buildProposalStateFilter } from '../utils/build-proposal-state-filter';

interface KeyRow {
  readonly key_id: string;
  readonly kind: 'generation' | 'version';
  readonly version: number | null;
  readonly from_sequence: number;
  readonly removed_sequence: number | null;
}

interface PendingProposal {
  readonly proposalID: string;
  readonly thread: string | null;
}

export interface PurgeFacts {
  readonly recordSequence: number;
  readonly itemID: string;

  // null when the set has no row for the item
  readonly purge: {
    readonly closedSequence: number | null;
    readonly purgedSequence: number | null;
  } | null;

  // null for a pending proposal of a new item
  readonly item: MemoryItemRow | null;
  readonly currentVersion: MemoryVersionRow | null;
  readonly keyRows: readonly KeyRow[];
  readonly pendingProposals: readonly PendingProposal[];

  // the keys of the item's rejection records
  readonly rejectionKeyIDs: readonly string[];
}

// Every fact that decides what a purge does, in plain columns and with no key.
export async function readPurgeFacts(
  db: Kysely<unknown>,
  request: PurgeRequest,
): Promise<PurgeFacts> {
  const tables = db.$extendTables<MemoryTables>();
  const itemID = request.itemID;

  const [purge, item, keyRows, proposals] = await Promise.all([
    tables
      .selectFrom('memory_evidence_purges')
      .select(['closed_sequence', 'purged_sequence'])
      .where('purge_key', '=', buildPurgeKey(request.recordSequence, itemID))
      .executeTakeFirst(),
    tables.selectFrom('memory_items').selectAll().where('item_id', '=', itemID).executeTakeFirst(),
    tables
      .selectFrom('memory_item_keys')
      .select(['key_id', 'kind', 'version', 'from_sequence', 'removed_sequence'])
      .where('item_id', '=', itemID)
      .execute(),
    tables
      .selectFrom('memory_proposals')
      .select([
        'proposal_id',
        'thread',
        buildProposalStateFilter({ state: 'open' }).as('is_open'),
        buildProposalStateFilter({ state: 'declined' }).as('is_declined'),
      ])
      .where('item_id', '=', itemID)
      .execute(),
  ]);

  const currentVersion =
    item === undefined
      ? undefined
      : await tables
          .selectFrom('memory_versions')
          .selectAll()
          .where('item_id', '=', itemID)
          .where('version', '=', item.version)
          .executeTakeFirst();

  return {
    ...request,
    purge:
      purge === undefined
        ? null
        : { closedSequence: purge.closed_sequence, purgedSequence: purge.purged_sequence },
    item: item ?? null,
    currentVersion: currentVersion ?? null,
    keyRows,
    pendingProposals: proposals
      .filter((proposal) => Boolean(proposal.is_open))
      .map((proposal) => ({ proposalID: proposal.proposal_id, thread: proposal.thread })),
    rejectionKeyIDs: await readRejectionKeyIDs(
      db,
      proposals.filter((proposal) => Boolean(proposal.is_declined)).map((row) => row.proposal_id),
    ),
  };
}

async function readRejectionKeyIDs(
  db: Kysely<unknown>,
  proposalIDs: readonly string[],
): Promise<readonly string[]> {
  if (proposalIDs.length === 0) {
    return [];
  }

  const rows = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('kind', 'in', ['memory.proposal_rejected', 'proposals.settled'])
    .where(sql`json_extract(payload, '$.proposalID')`, 'in', proposalIDs)
    .where('key_id', 'is not', null)
    .execute();

  return rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id]));
}
