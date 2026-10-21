// Gboard's clipboard chip and its undo each insert a whole span as one insertText. Typing, a
// prediction, an autocorrection and a swipe insert one word at most, except when Gboard splits a
// run-together word.
export function hasSeveralWords(text: string): boolean {
  return /\S\s+\S/u.test(text);
}
