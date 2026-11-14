import type { DiffPart } from '../conversation/build-word-diff';
import { buildWordDiff } from '../conversation/build-word-diff';
import type { ApprovalBody } from '../types';

export interface ApprovalChange {
  readonly label: string;
  readonly parts: readonly DiffPart[];
}

// Each part of a proposal's body that differs between what a card showed and what the host holds
// now, as a word diff of the text before and after.
export function buildApprovalChanges(
  before: Pick<ApprovalBody, 'sentence' | 'fields' | 'ruleSentence'>,
  after: Pick<ApprovalBody, 'sentence' | 'fields' | 'ruleSentence'>,
): readonly ApprovalChange[] {
  const changes: ApprovalChange[] = [];

  if (before.sentence !== after.sentence) {
    changes.push({ label: 'What it does', parts: buildWordDiff(before.sentence, after.sentence) });
  }

  const names = [...new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])];

  for (const name of names.toSorted()) {
    const was = before.fields[name] ?? '';
    const now = after.fields[name] ?? '';

    if (was !== now) {
      changes.push({ label: name, parts: buildWordDiff(was, now) });
    }
  }

  if (before.ruleSentence !== after.ruleSentence) {
    changes.push({
      label: 'The rule',
      parts: buildWordDiff(before.ruleSentence ?? '', after.ruleSentence ?? ''),
    });
  }

  return changes;
}
