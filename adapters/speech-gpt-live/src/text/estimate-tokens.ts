// An upper estimate of the tokens in a text, which the provider counts and the adapter cannot.
// Plain ASCII runs near 4 characters to a token, and any other character can cost several.
export function estimateTokens(text: string): number {
  let tokens = 0;

  for (const character of text) {
    tokens += (character.codePointAt(0) ?? 0) < 128 ? 1 / 3 : 2;
  }

  return tokens;
}
