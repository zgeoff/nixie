// Estimates the tokens of a text at 4 characters a token, which errs high for English prose. The
// batch limits are rough budgets, so an estimate serves where a tokenizer call per message would
// not.
export function countBatchTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
