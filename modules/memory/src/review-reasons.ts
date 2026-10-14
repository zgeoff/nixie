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
] as const;
