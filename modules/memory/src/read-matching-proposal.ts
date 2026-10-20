import type { JSONObject } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import { decodeProposalText } from './decode-proposal-text';
import { findImageSource } from './find-image-source';
import type { ImageRef, MemoryProposalRow } from './gate-types';
import { normalizeFactText } from './normalize-fact-text';
import { subjectColumn } from './subject-column';
import type { MemorySubject, MemoryTables, StoreParts, VersionRef } from './types';

// A change a write proposes, as a pending proposal must match it to take the write in.
export interface ProposedChange {
  readonly operation: 'remember' | 'retire';

  // the item and version an edit names, or null for a new item
  readonly target: VersionRef | null;
  readonly isPinned: boolean;
  readonly text: string;

  // the subject of the item, owner when unset
  readonly subject?: MemorySubject;

  // the write's checks, which name the photo of yours it comes from, if any
  readonly checks?: JSONObject | null;
}

const checksColumn = z.record(z.string(), z.json());

// Finds the oldest pending remember proposal that makes the same change: the same target, or a new
// item of the same kind for both, the same pin, the same photo or none, and the same text once
// normalized. Each text is sealed under its own item's key, so the search opens each one.
export async function readMatchingProposal(
  db: Kysely<MemoryTables>,
  parts: Pick<StoreParts, 'context'>,
  change: ProposedChange,
): Promise<MemoryProposalRow | null> {
  if (change.operation !== 'remember') {
    return null;
  }

  const target = change.target;
  const isPinned = change.isPinned ? 1 : 0;

  const pending = db
    .selectFrom('memory_proposals')
    .selectAll()
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .where('operation', '=', 'remember')
    .where('is_pinned', '=', isPinned);

  // a proposal for an edit takes its item's subject whoever proposed it, so the target alone
  // decides, and only a new item's proposal is matched by the subject the write asks for
  const sameTarget =
    target === null
      ? pending.where('is_new_item', '=', 1).where(subjectColumn, '=', change.subject ?? 'owner')
      : pending.where('item_id', '=', target.itemID).where('target_version', '=', target.version);

  const rows = await sameTarget.orderBy('created_sequence').execute();

  // a merge keeps the pending proposal's checks, so a write from a photo merges only into a
  // proposal from the same photo, and any other write never merges into one
  const image = findImageSource(change.checks ?? null);

  const samePhoto = rows.filter((row) => {
    const checks = row.checks === null ? null : checksColumn.parse(JSON.parse(row.checks));

    return isSameImage(findImageSource(checks), image);
  });

  return readSameText(parts, samePhoto, normalizeFactText(change.text));
}

function isSameImage(left: ImageRef | null, right: ImageRef | null): boolean {
  return left?.messageSequence === right?.messageSequence && left?.image === right?.image;
}

async function readSameText(
  parts: Pick<StoreParts, 'context'>,
  rows: readonly MemoryProposalRow[],
  wanted: string,
): Promise<MemoryProposalRow | null> {
  if (rows.length === 0) {
    return null;
  }

  const keys = await readRecordKeys(
    parts.context.log,
    rows.map((row) => row.item_id),
  );

  const texts = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      // a forgotten item's proposal has no key left, so it holds no text to match
      if (key === null || key === undefined) {
        return null;
      }

      const opened = await decodeProposalText(key, row.proposal_id, row.sealed);

      return opened.text;
    }),
  );

  return (
    rows.find((_, index) => {
      const text = texts[index];

      return text !== null && text !== undefined && normalizeFactText(text) === wanted;
    }) ?? null
  );
}
