import type { JSONObject } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { decodeProposalText } from './decode-proposal-text';
import { findImageSource } from './find-image-source';
import type { ImageRef, MemoryProposalRow } from './gate-types';
import { normalizeFactText } from './normalize-fact-text';
import { subjectColumn } from './subject-column';
import type {
  MemorySubject,
  MemoryTables,
  ProposalOperationKind,
  StoreParts,
  VersionRef,
} from './types';

export interface ProposedChange {
  readonly operation: ProposalOperationKind;

  readonly target: VersionRef | null;
  readonly isPinned: boolean;
  readonly text: string;

  readonly subject?: MemorySubject;

  readonly checks?: JSONObject | null;

  readonly until?: number | null;
}

const checksColumn = z.record(z.string(), z.json());

export async function readMatchingProposal(
  db: Kysely<MemoryTables>,
  parts: Pick<StoreParts, 'context'>,
  change: ProposedChange,
): Promise<MemoryProposalRow | null> {
  if (change.operation === 'retire') {
    return null;
  }

  const target = change.target;
  const isPinned = change.isPinned ? 1 : 0;

  const pending = db
    .selectFrom('memory_proposals')
    .selectAll()
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .where('operation', '=', change.operation)
    .where('is_pinned', '=', isPinned);

  const sameTarget =
    target === null
      ? pending.where('is_new_item', '=', 1).where(subjectColumn, '=', change.subject ?? 'owner')
      : pending.where('item_id', '=', target.itemID).where('target_version', '=', target.version);

  const rows = await sameTarget.orderBy('created_sequence').execute();

  const image = findImageSource(change.checks ?? null);

  const samePhoto = rows.filter((row) => {
    const checks = row.checks === null ? null : checksColumn.parse(JSON.parse(row.checks));

    return isSameImage(findImageSource(checks), image);
  });

  return readSameText(parts, samePhoto, {
    text: normalizeFactText(change.text),
    until: change.until ?? null,
  });
}

function isSameImage(left: ImageRef | null, right: ImageRef | null): boolean {
  return left?.messageSequence === right?.messageSequence && left?.image === right?.image;
}

interface WantedText {
  readonly text: string;
  readonly until: number | null;
}

async function readSameText(
  parts: Pick<StoreParts, 'context'>,
  rows: readonly MemoryProposalRow[],
  wanted: WantedText,
): Promise<MemoryProposalRow | null> {
  if (rows.length === 0) {
    return null;
  }

  const keys = await readRecordKeys(
    parts.context.log,
    rows.map((row) => row.item_id),
  );

  const proposalTexts = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      if (key === null || key === undefined) {
        return null;
      }

      const opened = await decodeProposalText(key, row.proposal_id, row.sealed);

      return opened;
    }),
  );

  return (
    rows.find((_, index) => {
      const opened = proposalTexts[index];

      return (
        opened !== null &&
        opened !== undefined &&
        normalizeFactText(opened.text) === wanted.text &&
        (opened.until ?? null) === wanted.until
      );
    }) ?? null
  );
}
