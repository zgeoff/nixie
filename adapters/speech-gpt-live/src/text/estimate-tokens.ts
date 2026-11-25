// An upper bound on the tokens in a text, which the provider counts and the adapter cannot. A
// byte-level tokenizer never makes more tokens than the text has UTF-8 bytes, whatever the text.
export function estimateTokens(text: string): number {
  return new TextEncoder().encode(text).length;
}
