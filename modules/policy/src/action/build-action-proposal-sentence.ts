// What the owner sees for an action proposal: the tool, what it does and who it reaches.
export function buildActionProposalSentence(
  tool: string,
  effects: readonly string[],
  destinations: readonly string[],
): string {
  const reach = destinations.length === 0 ? '' : ` to ${destinations.join(', ')}`;

  return `Run ${tool}${reach} (${effects.join(', ')}).`;
}
