import type { RuleSource } from '@heynixie/policy';

// Adds sources to the list a step's policy frame holds, in place, so a tool call that runs later sees
// content that reached the model after the step began. A source never leaves the list in the step.
export function takeSources(held: RuleSource[], more: readonly RuleSource[]): void {
  held.splice(0, held.length, ...[...new Set([...held, ...more])].toSorted());
}
