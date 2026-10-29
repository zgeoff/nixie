import type { Kysely } from 'kysely';
import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';
import type { MemoryProposalRow, ProposalAnswer } from './gate-types';
import { getRowSubject } from './get-row-subject';
import { parseEvidence } from './parse-evidence';
import { ProposalClosedError } from './proposal-closed-error';
import type { OpenedProposal } from './read-open-proposal';
import type { MemorySubject, MemoryTables, StoreParts, VersionRef } from './types';
import { UntilPassedError } from './until-passed-error';
import { writeRememberedItem } from './write-remembered-item';

export interface ApprovedRemember {
  readonly opened: OpenedProposal;
  readonly answer: ProposalAnswer;

  readonly target: VersionRef | null;

  readonly requireInTransaction?: (db: Kysely<MemoryTables>) => Promise<void>;
}

export async function writeApprovedRemember(
  parts: StoreParts,
  approved: ApprovedRemember,
): Promise<VersionRef> {
  try {
    return await writeApprovedVersion(parts, approved);
  } catch (error) {
    if (error instanceof UntilPassedError) {
      throw new ProposalClosedError(approved.opened.row.proposal_id, 'lapsed');
    }

    throw error;
  }
}

function writeApprovedVersion(parts: StoreParts, approved: ApprovedRemember): Promise<VersionRef> {
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
      ...(row.is_sensitive === 1 ? { isSensitive: true } : {}),
      ...(until === undefined || (until === null && row.target_version === null) ? {} : { until }),
      ...pickApprovedSubject(row, target),
    },
    extras,
  );
}

function pickApprovedSubject(
  row: MemoryProposalRow,
  target: VersionRef | null,
): { readonly subject?: MemorySubject } {
  if (target === null) {
    return { subject: getRowSubject(row) };
  }

  return row.new_subject === null ? {} : { subject: row.new_subject };
}
