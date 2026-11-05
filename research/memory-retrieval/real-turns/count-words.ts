// Counts the sequences of letters or digits, so an emoji or punctuation alone counts as no word.
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}
