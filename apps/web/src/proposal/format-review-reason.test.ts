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
  [
    'pinned',
    'It adds the item to the pinned core, and a pin waits for your review unless a rule of yours covers it.',
  ],
  ['other', 'nixie sent it to review.'],
  [
    'self_note',
    'nixie wrote it about itself, and a self-note waits for your review unless a rule of yours covers it.',
  ],
  [
    'from_photo',
    'It comes from a photo you sent, and nixie never takes a photo as your words unless a rule of yours covers it.',
  ],
  [
    'subject_change',
    'It changes whose fact the item is, and a subject change waits for your review unless a rule of yours covers it.',
  ],
  [
    'labels',
    'It changes how the item is listed or what brings it up, and such a change waits for your review unless a rule of yours covers it.',
  ],
] as const)('it describes the review reason %s', (reason, expected) => {
  expect(formatReviewReason(reason)).toBe(expected);
});
