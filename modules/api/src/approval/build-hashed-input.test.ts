import { expect, test } from 'bun:test';
import { buildInputHash } from '../utils/build-input-hash';
import { buildHashedInput } from './build-hashed-input';

test('#buildHashedInput hashes an answer with no trust fields as it did before they existed', () => {
  const hashed = buildHashedInput({
    proposalID: 'proposal-1',
    actionHash: 'sha256:abc',
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  const legacy = {
    proposalID: 'proposal-1',
    actionHash: 'sha256:abc',
    choice: 'approve',
    ruleHash: null,
    deferUntil: null,
    hasNote: false,
    isEdited: false,
    revisionOf: null,
    ignoreCloseMatch: null,
  };

  expect(buildInputHash(hashed)).toBe(buildInputHash(legacy));
});

test('#buildHashedInput hashes a trust answer differently from a plain approval', () => {
  const base = {
    proposalID: 'proposal-1',
    actionHash: 'sha256:abc',
    choice: 'approve' as const,
    clientActionID: crypto.randomUUID(),
  };

  const plain = buildInputHash(buildHashedInput(base));

  const trusting = buildInputHash(
    buildHashedInput({ ...base, trust: 'read', placeHash: 'sha256:place' }),
  );

  expect(trusting).not.toBe(plain);
});
