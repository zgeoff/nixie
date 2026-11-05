// A cheap split of turns by kind: a message with code, a path, an issue or PR ID, or a word from
// software work counts as technical, and every other message as chat.
const technicalPattern =
  /`|\b[\w-]+\/[\w./-]+|\b[A-Z]{2,}-\d+\b|#\d+\b|\.(?:ts|js|md|json|yml|yaml|sh|toml)\b|\b(?:PR|CI|repo|branch|commit|merge|bug|deploy|test|tests|code|API|config|schema|skill|model|token|prompt)s?\b/iu;

export function isTechnicalTurn(turn: { query: string }): boolean {
  return technicalPattern.test(turn.query);
}
