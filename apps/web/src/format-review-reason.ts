import type { MemoryProposal } from './types';

// Why a write waits for your review, in words: the check that sent it to review.
export function formatReviewReason(reason: MemoryProposal['reason']): string {
  return reviewReasons[reason];
}

const reviewReasons: Readonly<Record<MemoryProposal['reason'], string>> = {
  no_quote: 'No quote from you backs it.',
  quote_not_typed: 'Its quote is not something you typed.',
  quote_in_quoted_block: 'Its quote sits in text you quoted from someone else.',
  invisible_character: 'Its quote holds an invisible character.',
  token_missing: 'It holds a name, number or address that its quote lacks.',
  checker_not_asserted: 'The checker found that your words do not state it.',
  checker_unsure: 'The checker was unsure that your words state it.',
  checker_unreachable: 'The checker could not be reached.',
  forgotten_evidence: 'The message it quotes was forgotten.',
  ambiguous_target: 'It is unclear which item it changes.',
  pinned: 'It changes a pinned item.',
};
