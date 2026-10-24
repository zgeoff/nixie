// The spoken-reply rules every candidate adds to nixie's persona. Decision 0040 lets an opening
// acknowledgement claim no outcome and make no promise.
export const acknowledgeRules =
  'You are on a voice call. Open every reply with a short acknowledgement of two to four words, such as "Sure, let me think." or "Good question.", that never claims an outcome or makes a promise. Then answer in two or three short spoken sentences, with no lists and no markdown.';

// The Sonnet pipeline speaks a picked opener before the answer model's first words.
export const openerSpokenRules =
  'You are on a voice call. A short acknowledgement such as "Sure." has already been spoken, so start straight with the answer, with no greeting or acknowledgement. Answer in two or three short spoken sentences, with no lists and no markdown.';
