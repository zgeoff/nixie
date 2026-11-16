import type { Kysely } from 'kysely';
import type { MemoryProposalRow, ProposalAnswer } from '../gate/gate-context';
import { writeRememberedItem } from '../item/write-remembered-item';
import { buildDerivedLabels } from '../label/build-derived-labels';
import type { OpenedProposal } from '../proposal/read-open-proposal';
import type { MemorySubject, StoreParts, VersionRef } from '../types';
import { ProposalClosedError } from '../utils/error/proposal-closed-error';
import { UntilPassedError } from '../utils/error/until-passed-error';
import { getRowSubject } from '../utils/get-row-subject';
import { parseEvidence } from '../utils/parse-evidence';
import type { VersionLabels } from '../version/write-version-in-transaction';
import { buildApprovalExtras } from './build-approval-extras';
import { buildApprovedProvenance } from './build-approved-provenance';

export interface ApprovedRemember {
  readonly opened: OpenedProposal;
  readonly answer: ProposalAnswer;

  readonly target: VersionRef | null;

  readonly requireInTransaction?: (db: Kysely<unknown>) => Promise<void>;
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
  const text = answer.editedText ?? opened.text.text;
  const labels = pickApprovedLabels(opened, { text, isCreation: target === null });

  const extras = {
    ...approvalExtras,
    requireInTransaction: async (db: Kysely<unknown>) => {
      await approvalExtras.requireInTransaction?.(db);
      await approved.requireInTransaction?.(db);
    },
    ...(target === null ? { newItemID: row.item_id } : {}),
    ...(labels === null ? {} : { labels }),
  };

  return writeRememberedItem(
    parts,
    {
      text,
      provenance: buildApprovedProvenance(row, isEdited),
      ...(target === null ? {} : { target }),
      ...(evidence === null || opened.text.quote === null
        ? {}
        : { evidence, evidenceQuote: opened.text.quote }),
      ...(row.is_pinned === 1 ? { isPinned: true } : {}),
      ...(until === undefined || (until === null && row.target_version === null) ? {} : { until }),
      ...pickApprovedSubject(row, target),
    },
    extras,
  );
}

interface ApprovedText {
  readonly text: string;
  readonly isCreation: boolean;
}

// A creating proposal from before labels has no label record, so its item gets the derived labels
// in the same transaction as its version.
function pickApprovedLabels(opened: OpenedProposal, approved: ApprovedText): VersionLabels | null {
  if (opened.labels !== null) {
    return { labels: opened.labels, change: 'written' };
  }

  return approved.isCreation
    ? {
        labels: buildDerivedLabels(approved.text, getRowSubject(opened.row)),
        change: 'backfilled',
      }
    : null;
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
