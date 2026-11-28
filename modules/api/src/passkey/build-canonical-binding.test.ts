import { expect, test } from 'bun:test';
import { buildCanonicalBinding } from './build-canonical-binding';

test('#buildCanonicalBinding differs when the ticked places of an answer differ', () => {
  const base = {
    kind: 'answer' as const,
    proposalID: 'proposal-1',
    actionHash: 'sha256:abc',
    choice: 'approve' as const,
  };

  expect(buildCanonicalBinding({ ...base, tickedPlaces: [0] })).not.toBe(
    buildCanonicalBinding({ ...base, tickedPlaces: [0, 1] }),
  );
});
