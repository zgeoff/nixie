import { readRecordKeys } from '@heynixie/log';
import { decodeProposalText } from './decode-proposal-text';
import { findImageSource } from './find-image-source';
import type {
  MemoryProposal,
  MemoryProposalRow,
  PendingFilter,
  ProposalImage,
  ProposalSource,
} from './gate-types';
import { getRowSubject } from './get-row-subject';
import { parseEvidence } from './parse-evidence';
import { subjectColumn } from './subject-column';
import { toReviewReason } from './to-review-reason';
import type { MemoryTables, StoreParts } from './types';

// Reads the proposals that wait for your answer, oldest first, with their text opened and every
// source that proposed each one. A proposal whose item was forgotten has no key left, so it reads
// as nothing and drops out of the list. A filter keeps only the proposals of its subjects.
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
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .$if(subjects !== undefined, (query) => query.where(subjectColumn, 'in', subjects ?? []))
    .orderBy('created_sequence')
    .execute();

  const keys = await readRecordKeys(
    log,
    rows.map((row) => row.item_id),
  );

  const merges = await readMergeSources(parts, rows);

  const proposals = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      if (key === null || key === undefined) {
        return null;
      }

      const text = await decodeProposalText(key, row.proposal_id, row.sealed);

      return {
        proposalID: row.proposal_id,
        operation: row.operation,
        itemID: row.item_id,
        targetVersion: row.target_version,
        isPinned: row.is_pinned === 1,
        subject: getRowSubject(row),
        reason: toReviewReason(row.review_reason),
        actionHash: row.action_hash,
        origin: row.origin,
        source: row.source,
        createdAt: row.created_at,
        lapseAt: row.lapse_at,
        sources: [buildFirstSource(row), ...(merges.get(row.proposal_id) ?? [])],
        text: text.text,
        quote: text.quote,
        evidence: parseEvidence(row.evidence),
        image: findProposalImage(row),
      } satisfies MemoryProposal;
    }),
  );

  return proposals.filter((proposal) => proposal !== null);
}

// each proposal's merged sources, oldest first
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

function buildFirstSource(row: MemoryProposalRow): ProposalSource {
  return {
    origin: row.origin,
    thread: row.thread,
    taskID: row.task_id,
    model: row.model,
    proposedAt: row.created_at,
  };
}

// the photo of yours the proposal comes from, in the thread whose message holds it
function findProposalImage(row: MemoryProposalRow): ProposalImage | null {
  const image = row.checks === null ? null : findImageSource(JSON.parse(row.checks));

  return image === null || row.thread === null ? null : { thread: row.thread, ...image };
}
