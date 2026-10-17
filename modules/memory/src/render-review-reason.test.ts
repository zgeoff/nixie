import { expect, test } from 'bun:test';
import { defaultGateLimits } from './default-gate-limits';
import { renderReviewReason } from './render-review-reason';
import { reviewReasons } from './review-reasons';

test("it renders each reason's full sentence with the owner's name and pronouns", () => {
  const gate = {
    ownerName: 'Avery',
    ownerPronouns: { they: 'she', their: 'her' },
    limits: { ...defaultGateLimits, evidenceWindow: 12 },
  };

  expect(reviewReasons.map((reason) => renderReviewReason(reason, gate))).toMatchInlineSnapshot(`
    [
      "no_quote: Saved as a proposal for Avery to review. The write gave no quote, or neither Avery's last 12 messages nor the message its eventID names contains it.",
      "quote_not_typed: Saved as a proposal for Avery to review. The quote is in text Avery pasted or dropped in, or in a reply or tool result, not words she typed.",
      "quote_in_quoted_block: Saved as a proposal for Avery to review. The quote is inside a quoted block, so it may be someone else's words.",
      "invisible_character: Saved as a proposal for Avery to review. The new text or the quote contains a hidden character.",
      "token_missing: Saved as a proposal for Avery to review. The new text has a number, address, handle or link that isn't in the quote, or in what Avery typed in her last 12 messages when an allow rule skips the quote.",
      "checker_not_asserted: Saved as a proposal for Avery to review. Avery's words didn't clearly say this.",
      "checker_unsure: Saved as a proposal for Avery to review. It wasn't clear whether Avery's words say this.",
      "checker_unreachable: Saved as a proposal for Avery to review. The check failed or didn't answer in time.",
      "forgotten_evidence: Saved as a proposal for Avery to review. The message you quoted backed a memory that Avery forgot, so it can't back a write again.",
      "ambiguous_target: Saved as a proposal for Avery to review. You haven't recalled this version of the item here.",
      "pinned: Saved as a proposal for Avery to review. Pinned items always wait for her review.",
      "other: Saved as a proposal for Avery to review. A newer release of nixie sent it to review, for a reason this release does not name.",
      "self_note: Saved as a proposal for Avery to review. It's a self-note, which you write about yourself, and every self-note waits for her review.",
    ]
  `);
});

test('it gives every review reason a sentence after its code', () => {
  const gate = {
    ownerName: 'Avery',
    ownerPronouns: { they: 'he', their: 'his' },
    limits: defaultGateLimits,
  };

  expect(reviewReasons.map((reason) => renderReviewReason(reason, gate))).toSatisfyAll(
    (sentence: string) =>
      /^[a-z_]+: Saved as a proposal for Avery to review\. [A-Z][^.]+\.$/u.test(sentence),
  );
});

test('it calls the owner "the owner" when the config names no one, and opens a sentence with a capital', () => {
  const gate = {
    ownerName: null,
    ownerPronouns: { they: 'they', their: 'their' },
    limits: defaultGateLimits,
  };

  expect(renderReviewReason('checker_not_asserted', gate)).toBe(
    "checker_not_asserted: Saved as a proposal for the owner to review. The owner's words didn't clearly say this.",
  );
});

test('it names a window of one message in the singular', () => {
  const gate = {
    ownerName: 'Avery',
    ownerPronouns: { they: 'she', their: 'her' },
    limits: { ...defaultGateLimits, evidenceWindow: 1 },
  };

  expect(renderReviewReason('no_quote', gate)).toBe(
    "no_quote: Saved as a proposal for Avery to review. The write gave no quote, or neither Avery's last message nor the message its eventID names contains it.",
  );
});
