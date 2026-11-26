import type { ProposalTables } from '@heynixie/proposals';
import type {
  MemoryProposal,
  MemoryProposalRow,
  PendingFilter,
  ProposalImage,
  ProposalSource,
} from '../gate/gate-context';
import { toReviewReason } from '../gate/to-review-reason';
import { findImageSource } from '../image/find-image-source';
import { readItemKeys } from '../item-key/read-item-keys';
import { proposalLabelsCodec } from '../label/proposal-labels-codec';
import type { MemoryTables, StoreParts } from '../types';
import { buildProposalStateFilter } from '../utils/build-proposal-state-filter';
import { decodeProposalText } from '../utils/decode-proposal-text';
import { getRowSubject } from '../utils/get-row-subject';
import { parseEvidence } from '../utils/parse-evidence';
import { subjectColumn } from '../utils/subject-column';

export async function readPendingProposals(
  parts: StoreParts,
  filter: PendingFilter = {},
): Promise<readonly MemoryProposal[]> {
  const subjects = filter.subjects;
  const log = parts.context.log;

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .selectAll()
    .where(buildProposalStateFilter({ state: 'open', nowMs: parts.context.gate.clock.now() }))
    .$if(subjects !== undefined, (query) => query.where(subjectColumn, 'in', subjects ?? []))
    .orderBy('created_sequence')
    .execute();

  const keys = await readItemKeys(
    log,
    rows.map((row) => ({
      value: 'proposal',
      itemID: row.item_id,
      sequence: row.created_sequence,
    })),
  );

  const lapses = await readLapses(parts, rows);
  const merges = await readMergeSources(parts, rows);
  const labelEdits = await readLabelEdits(parts, rows);

  const proposals = await Promise.all(
    rows.map(async (row, index) => {
      const opened = keys[index];

      if (opened?.status !== 'readable') {
        return null;
      }

      const key = opened.key;

      const text = await decodeProposalText(key, row.proposal_id, row.sealed);

      const labels =
        row.sealed_labels === null
          ? null
          : await proposalLabelsCodec.decode(key, row.proposal_id, row.sealed_labels);

      return {
        proposalID: row.proposal_id,
        operation: row.operation,
        itemID: row.item_id,
        targetVersion: pickShownVersion(row, labelEdits),
        isPinned: row.is_pinned === 1,
        subject: getRowSubject(row),
        newSubject: row.new_subject,
        reason: toReviewReason(row.review_reason),
        actionHash: row.action_hash,
        origin: row.origin,
        source: row.source,
        createdAt: row.created_at,
        lapseAt: lapses.get(row.proposal_id) ?? row.created_at,
        sources: [buildFirstSource(row), ...(merges.get(row.proposal_id) ?? [])],
        text: text.text,
        quote: text.quote,
        evidence: parseEvidence(row.evidence),
        image: findProposalImage(row),
        until: text.until ?? null,
        labels: labels === null ? null : { ...labels, isLabelOnly: row.is_label_only === 1 },
      } satisfies MemoryProposal;
    }),
  );

  return proposals.filter((proposal) => proposal !== null);
}

// The lapse of each proposal, which the shared row holds.
async function readLapses(
  parts: StoreParts,
  rows: readonly MemoryProposalRow[],
): Promise<ReadonlyMap<string, number>> {
  if (rows.length === 0) {
    return new Map();
  }

  const lapses = await parts.context.log.writer.db
    .$extendTables<ProposalTables>()
    .selectFrom('proposals')
    .select(['proposal_id', 'lapses_at'])
    .where(
      'proposal_id',
      'in',
      rows.map((row) => row.proposal_id),
    )
    .execute();

  return new Map(lapses.map((row) => [row.proposal_id, row.lapses_at]));
}

async function readMergeSources(
  parts: StoreParts,
  rows: readonly MemoryProposalRow[],
): Promise<ReadonlyMap<string, readonly ProposalSource[]>> {
  if (rows.length === 0) {
    return new Map();
  }

  const merges = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposal_merges')
    .selectAll()
    .where(
      'proposal_id',
      'in',
      rows.map((row) => row.proposal_id),
    )
    .orderBy('sequence')
    .execute();

  const sources = new Map<string, ProposalSource[]>();

  for (const merge of merges) {
    const list = sources.get(merge.proposal_id) ?? [];

    list.push({
      origin: merge.origin,
      thread: merge.thread,
      taskID: merge.task_id,
      model: merge.model,
      proposedAt: merge.recorded_at,
    });

    sources.set(merge.proposal_id, list);
  }

  return sources;
}

async function readLabelEdits(
  parts: StoreParts,
  rows: readonly MemoryProposalRow[],
): Promise<ReadonlyMap<string, number>> {
  const itemIDs = rows.flatMap((row) => (row.target_version === null ? [] : [row.item_id]));

  if (itemIDs.length === 0) {
    return new Map();
  }

  const items = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'label_edits'])
    .where('item_id', 'in', itemIDs)
    .execute();

  return new Map(items.map((item) => [item.item_id, item.label_edits]));
}

// An edit proposal shows the revision it read. One from before labels shows its text version plus
// the label edits the item has.
function pickShownVersion(
  row: MemoryProposalRow,
  labelEdits: ReadonlyMap<string, number>,
): number | null {
  if (row.target_version === null) {
    return null;
  }

  return row.target_revision ?? row.target_version + (labelEdits.get(row.item_id) ?? 0);
}

function buildFirstSource(row: MemoryProposalRow): ProposalSource {
  return {
    origin: row.origin,
    thread: row.thread,
    taskID: row.task_id,
    model: row.model,
    proposedAt: row.created_at,
  };
}

function findProposalImage(row: MemoryProposalRow): ProposalImage | null {
  const image = row.checks === null ? null : findImageSource(JSON.parse(row.checks));

  return image === null || row.thread === null ? null : { thread: row.thread, ...image };
}
