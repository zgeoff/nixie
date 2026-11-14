// About 4 characters make a token. nixie holds no model tokenizer, and a budget needs a stable
// count more than an exact one.
export function countTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
