// The dollars an earlier raise of the day set for the ID, or 0 for an ID with none. An ID such as
// `constructor` names no inherited property.
export function pickEarlierRaise(raises: Readonly<Record<string, number>>, id: string): number {
  return Object.hasOwn(raises, id) ? (raises[id] ?? 0) : 0;
}
