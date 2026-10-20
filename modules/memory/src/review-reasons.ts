// Every reason a write waits for your review instead of applying, as the proposal record stores it.
export const reviewReasons = [
  'no_quote',
  'quote_not_typed',
  'quote_in_quoted_block',
  'invisible_character',
  'token_missing',
  'checker_not_asserted',
  'checker_unsure',
  'checker_unreachable',
  'forgotten_evidence',
  'ambiguous_target',
  'pinned',

  // a reason that a later release writes and this one does not know, as every reader shows it
  'other',
  'self_note',
  'from_photo',
] as const;
