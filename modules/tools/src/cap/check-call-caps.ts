// Returns a sentence for each cap that a task run could never meet or never use, and none when the
// caps pass.
export function checkCallCaps(
  maxCalls: Readonly<Record<string, number>>,
  tools: readonly string[],
): readonly string[] {
  return Object.entries(maxCalls).flatMap(([tool, cap]) => {
    if (!Number.isInteger(cap) || cap < 1) {
      return [`the cap on ${tool} must be a whole number of 1 or more`];
    }

    return tools.includes(tool) ? [] : [`the cap names ${tool}, which tools does not list`];
  });
}
