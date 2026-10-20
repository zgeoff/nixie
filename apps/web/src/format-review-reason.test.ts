import { expect, test } from 'bun:test';
import { formatReviewReason } from './format-review-reason';

test.each([
  ['no_quote', 'No quote from you backs it.'],
  ['quote_not_typed', 'Its quote is not something you typed.'],
  ['quote_in_quoted_block', 'Its quote sits in text you quoted from someone else.'],
  ['invisible_character', 'Its quote holds an invisible character.'],
  ['token_missing', 'It holds a name, number or address that its quote lacks.'],
  ['checker_not_asserted', 'The checker found that your words do not state it.'],
  ['checker_unsure', 'The checker was unsure that your words state it.'],
  ['checker_unreachable', 'The checker could not be reached.'],
  ['forgotten_evidence', 'The message it quotes was forgotten.'],
  ['ambiguous_target', 'It is unclear which item it changes.'],
  ['pinned', 'It changes a pinned item.'],
  ['other', 'A newer release of nixie sent it to review.'],
  ['self_note', 'nixie wrote it about itself, and every self-note waits for your review.'],
  ['from_photo', 'It comes from a photo you sent, and nixie never takes a photo as your words.'],
] as const)('it describes the review reason %s', (reason, expected) => {
  expect(formatReviewReason(reason)).toBe(expected);
});
