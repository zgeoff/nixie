// about 0.7 English words to a token, which keeps a summary that meets its word target under its cap
const wordsPerToken = 0.7;

// Counts the words a summary's target asks for, for a token cap, to the nearest 50. The model cannot
// count its own tokens, so the instruction gives it words.
export function countSummaryWords(summaryTokens: number): number {
  return Math.max(50, Math.round((summaryTokens * wordsPerToken) / 50) * 50);
}
