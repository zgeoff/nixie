// Gboard's clipboard chip and its undo each insert a whole span as one insertText, which typing,
// a prediction, an autocorrection and a swipe never do: each of those inserts one word at most. A
// split of a run-together word is the one typed insert of several words.
export function hasSeveralWords(text: string): boolean {
  return /\S\s+\S/u.test(text);
}
