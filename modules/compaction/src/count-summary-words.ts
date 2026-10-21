// English text runs about 0.7 words to a token, so a summary that meets its word target stays
// under its token cap.
const wordsPerToken = 0.7;

export function countSummaryWords(summaryTokens: number): number {
  return Math.max(50, Math.round((summaryTokens * wordsPerToken) / 50) * 50);
}
