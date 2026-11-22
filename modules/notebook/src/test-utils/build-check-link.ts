import type { CheckLink } from '../check/build-check';

export function buildCheckLink(from: string, overrides: Partial<CheckLink> = {}): CheckLink {
  return {
    fromNoteID: `${from}-uuid`,
    fromShortID: from,
    type: 'cites',
    kind: 'memory',
    targetID: 'item-uuid',
    targetShownID: 'itemshort1',
    isGone: false,
    reason: null,
    createdAt: 1,
    ...overrides,
  };
}
