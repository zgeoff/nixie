import type { RememberRequest, StoreParts, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

// Creates an item with its first version, or adds an edited version to the item the caller read.
// An edit keeps the item's state, and fails as stale once the item has moved past the version the
// caller read.
export function writeRememberedItem(
  parts: StoreParts,
  request: RememberRequest,
): Promise<VersionRef> {
  const text = {
    text: request.text,
    evidenceQuote: request.evidenceQuote ?? null,
    intentQuote: null,
  };
  const evidence = request.evidence ?? null;

  if (request.target === undefined) {
    return writeMemoryVersion(parts, {
      requirement: null,
      provenance: request.provenance,
      buildVersion: () =>
        Promise.resolve({
          change: 'created',
          state: 'active',
          text,
          evidence,
          intentEvidence: null,
        }),
      ...(request.isPinned === undefined ? {} : { isPinned: request.isPinned }),
    });
  }
  return writeMemoryVersion(parts, {
    requirement: { target: request.target, operation: 'edit', states: ['active', 'retired'] },
    provenance: request.provenance,
    buildVersion: async (readEarlier, current) => {
      const before = await readEarlier(current);

      return {
        change: 'edited',
        state: before.row.state,
        text,
        evidence,
        intentEvidence: null,
      };
    },
    ...(request.isPinned === undefined ? {} : { isPinned: request.isPinned }),
  });
}
