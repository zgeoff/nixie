import type { Kysely } from 'kysely';
import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';
import type { ProposalAnswer } from './gate-types';
import { getRowSubject } from './get-row-subject';
import { parseEvidence } from './parse-evidence';
import type { OpenedProposal } from './read-open-proposal';
import type { MemoryTables, StoreParts, VersionRef } from './types';
import { writeRememberedItem } from './write-remembered-item';

export interface ApprovedRemember {
  readonly opened: OpenedProposal;
  readonly answer: ProposalAnswer;

  readonly target: VersionRef | null;

  readonly requireInTransaction?: (db: Kysely<MemoryTables>) => Promise<void>;
}

export function writeApprovedRemember(
  parts: StoreParts,
  approved: ApprovedRemember,
): Promise<VersionRef> {
  const opened = approved.opened;
  const answer = approved.answer;
  const target = approved.target;
  const row = opened.row;
  const isEdited = answer.editedText !== undefined;
  const evidence = isEdited ? null : parseEvidence(row.evidence);
  const approvalExtras = buildApprovalExtras(parts, row, answer);
  const until = opened.text.until;

  const extras = {
    ...approvalExtras,
    requireInTransaction: async (db: Kysely<MemoryTables>) => {
      await approvalExtras.requireInTransaction?.(db);
      await approved.requireInTransaction?.(db);
    },
    ...(target === null ? { newItemID: row.item_id } : {}),
  };

  return writeRememberedItem(
    parts,
    {
      text: answer.editedText ?? opened.text.text,
      provenance: buildApprovedProvenance(row, isEdited),
      ...(target === null ? {} : { target }),
      ...(evidence === null || opened.text.quote === null
        ? {}
        : { evidence, evidenceQuote: opened.text.quote }),
      ...(row.is_pinned === 1 ? { isPinned: true } : {}),
      ...(until === undefined || (until === null && row.target_version === null) ? {} : { until }),
      subject: getRowSubject(row),
    },
    extras,
  );
}
