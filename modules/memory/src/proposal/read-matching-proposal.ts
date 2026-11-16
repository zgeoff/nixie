import type { JSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { ImageRef, MemoryProposalRow } from '../gate/gate-context';
import { findImageSource } from '../image/find-image-source';
import { readItemKeys } from '../item-key/read-item-keys';
import { proposalLabelsCodec } from '../label/proposal-labels-codec';
import type {
  Labels,
  MemorySubject,
  MemoryTables,
  ProposalOperationKind,
  StoreParts,
  VersionRef,
} from '../types';
import { decodeProposalText } from '../utils/decode-proposal-text';
import { subjectColumn } from '../utils/subject-column';
import { normalizeFactText } from './normalize-fact-text';

export interface ProposedChange {
  readonly operation: ProposalOperationKind;

  readonly target: VersionRef | null;
  readonly isPinned: boolean;
  readonly text: string;

  readonly subject?: MemorySubject;

  readonly newSubject?: MemorySubject;

  readonly checks?: JSONObject | null;

  readonly until?: number | null;

  readonly labels?: Labels;

  readonly targetRevision?: number;

  readonly isLabelOnly?: boolean;
}

const checksColumn = z.record(z.string(), z.json());

export async function readMatchingProposal(
  db: Kysely<unknown>,
  parts: Pick<StoreParts, 'context'>,
  change: ProposedChange,
): Promise<MemoryProposalRow | null> {
  if (change.operation === 'retire') {
    return null;
  }

  const target = change.target;
  const isPinned = change.isPinned ? 1 : 0;

  const pending = db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .selectAll()
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .where('operation', '=', change.operation)
    .where('is_pinned', '=', isPinned);

  const isLabelled = change.labels !== undefined;
  const isLabelOnly = change.isLabelOnly === true ? 1 : 0;

  const sameLabelled = isLabelled
    ? pending
        .where('sealed_labels', 'is not', null)
        .where('is_label_only', '=', isLabelOnly)
        .where('target_revision', 'is', change.targetRevision ?? null)
    : pending.where('sealed_labels', 'is', null);

  const sameTarget =
    target === null
      ? sameLabelled
          .where('is_new_item', '=', 1)
          .where(subjectColumn, '=', change.subject ?? 'owner')
      : sameLabelled
          .where('item_id', '=', target.itemID)
          .where('target_version', '=', target.version)
          .where('new_subject', 'is', change.newSubject ?? null);

  const rows = await sameTarget.orderBy('created_sequence').execute();

  const image = findImageSource(change.checks ?? null);

  const samePhoto = rows.filter((row) => {
    const checks = row.checks === null ? null : checksColumn.parse(JSON.parse(row.checks));

    return isSameImage(findImageSource(checks), image);
  });

  return readSameText(parts, db, samePhoto, {
    text: normalizeFactText(change.text),
    until: change.until ?? null,
    labels: change.labels ?? null,
  });
}

function isSameImage(left: ImageRef | null, right: ImageRef | null): boolean {
  return left?.messageSequence === right?.messageSequence && left?.image === right?.image;
}

interface WantedText {
  readonly text: string;
  readonly until: number | null;
  readonly labels: Labels | null;
}

async function readSameText(
  parts: Pick<StoreParts, 'context'>,
  db: Kysely<unknown>,
  rows: readonly MemoryProposalRow[],
  wanted: WantedText,
): Promise<MemoryProposalRow | null> {
  if (rows.length === 0) {
    return null;
  }

  const keys = await readItemKeys(
    parts.context.log,
    rows.map((row) => ({
      value: 'proposal',
      itemID: row.item_id,
      sequence: row.created_sequence,
    })),
    db,
  );

  const proposalTexts = await Promise.all(
    rows.map(async (row, index) => {
      const readable = keys[index];

      if (readable?.status !== 'readable') {
        return null;
      }

      const key = readable.key;

      const opened = await decodeProposalText(key, row.proposal_id, row.sealed);

      const labels =
        row.sealed_labels === null
          ? null
          : await proposalLabelsCodec.decode(key, row.proposal_id, row.sealed_labels);

      return { ...opened, labels };
    }),
  );

  return (
    rows.find((_, index) => {
      const opened = proposalTexts[index];

      return (
        opened !== null &&
        opened !== undefined &&
        normalizeFactText(opened.text) === wanted.text &&
        (opened.until ?? null) === wanted.until &&
        isSameLabels(opened.labels, wanted.labels)
      );
    }) ?? null
  );
}

function isSameLabels(left: Labels | null, right: Labels | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.gist === right.gist &&
    left.topic === right.topic &&
    left.triggers.length === right.triggers.length &&
    left.triggers.every((trigger, index) => trigger === right.triggers[index])
  );
}
