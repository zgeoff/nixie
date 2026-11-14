const overflowReasons: ReadonlySet<string> = new Set(['blocking_limit', 'prompt_too_long']);

export function isOverflowReason(terminalReason: string | undefined): boolean {
  return terminalReason !== undefined && overflowReasons.has(terminalReason);
}
