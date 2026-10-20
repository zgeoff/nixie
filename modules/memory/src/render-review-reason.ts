import type { GateContext, ReviewReason } from './gate-types';

interface ReviewWords {
  readonly owner: string;
  readonly they: string;
  readonly their: string;
  readonly window: number;
}

// one sentence for each reason, which the type keeps complete
const reasonSentences: Readonly<Record<ReviewReason, (words: ReviewWords) => string>> = {
  no_quote: (words) =>
    `The write gave no quote, or neither ${words.owner}'s ${formatWindow(words.window)} nor the message its eventID names contains it.`,
  quote_not_typed: (words) =>
    `The quote is in text ${words.owner} pasted or dropped in, or in a reply or tool result, not words ${words.they} typed.`,
  quote_in_quoted_block: () =>
    "The quote is inside a quoted block, so it may be someone else's words.",
  invisible_character: () => 'The new text or the quote contains a hidden character.',
  token_missing: (words) =>
    `The new text has a number, address, handle or link that isn't in the quote, or in what ${words.owner} typed in ${words.their} ${formatWindow(words.window)} when an allow rule skips the quote.`,
  checker_not_asserted: (words) => `${words.owner}'s words didn't clearly say this.`,
  checker_unsure: (words) => `It wasn't clear whether ${words.owner}'s words say this.`,
  checker_unreachable: () => "The check failed or didn't answer in time.",
  forgotten_evidence: (words) =>
    `The message you quoted backed a memory that ${words.owner} forgot, so it can't back a write again.`,
  ambiguous_target: () => "You haven't recalled this version of the item here.",
  pinned: (words) => `Pinned items always wait for ${words.their} review.`,
  other: () =>
    'A newer release of nixie sent it to review, for a reason this release does not name.',
  self_note: (words) =>
    `It's a self-note, which you write about yourself, and every self-note waits for ${words.their} review.`,
};

// Renders a review reason as the fixed sentence the model reads after its code: the write is saved
// as a proposal for you to review, and why. Each sentence names you as the config does, and the
// quote's window is the gate's own, so the model never reads a bare code or guesses what it means.
export function renderReviewReason(
  reason: ReviewReason,
  gate: Pick<GateContext, 'ownerName' | 'ownerPronouns' | 'limits'>,
): string {
  const words: ReviewWords = {
    owner: gate.ownerName ?? 'the owner',
    they: gate.ownerPronouns.they,
    their: gate.ownerPronouns.their,
    window: gate.limits.evidenceWindow,
  };

  const why = reasonSentences[reason](words);

  return `${reason}: Saved as a proposal for ${words.owner} to review. ${toSentenceCase(why)}`;
}

function formatWindow(window: number): string {
  return window === 1 ? 'last message' : `last ${window} messages`;
}

// "the owner" opens a sentence as "The owner"
function toSentenceCase(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
