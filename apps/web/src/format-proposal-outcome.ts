import type { ProposalOutcome } from './types';

const staleNotices: Readonly<
  Record<Extract<ProposalOutcome, { status: 'stale' }>['cause'], string>
> = {
  lapsed: 'Nothing changed: this proposal lapsed before your answer.',
  answered: 'Nothing changed: this proposal was already answered.',
  moved: 'Nothing changed: the item changed after the proposal was made.',
  changed: 'Nothing changed: this proposal changed after the list loaded.',
  gone: 'Nothing changed: this proposal is gone.',
};

const refusalNotices: Readonly<
  Record<Extract<ProposalOutcome, { status: 'refused' }>['code'], string>
> = {
  CLIENT_ACTION_ID_REUSED: 'Nothing changed: this answer clashed with another one. Try again.',
  PINNED_CORE_FULL: 'Nothing changed: the pinned core has no room for this item.',
  RETIREMENT_EDIT: 'Nothing changed: a retirement takes no edited text.',
  REVISION_TARGET: 'Nothing changed: that item cannot take this text as a revision.',
  WRONG_STATE: 'Nothing changed: the item is in a state this answer cannot change.',
};

// What an answer to a proposal did, in words, or null for an answer that applied as asked. A close
// match names no item here, because the proposal shows the item it matched.
export function formatProposalOutcome(outcome: ProposalOutcome): string | null {
  if (outcome.status === 'stale') {
    return staleNotices[outcome.cause];
  }

  if (outcome.status === 'refused') {
    return refusalNotices[outcome.code];
  }

  return outcome.status === 'close_match'
    ? 'Nothing changed yet: an active item already says this.'
    : null;
}
