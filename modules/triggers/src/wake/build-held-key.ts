// The primary key of wake_held: the rule and the arrival that it matched.
export function buildHeldKey(ruleID: string, arrivedSequence: number): string {
  return `${ruleID}\n${String(arrivedSequence)}`;
}
