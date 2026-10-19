import { expect, test } from 'bun:test';
import { buildProposalHash } from './build-proposal-hash';

test.each([
  [
    'an owner item',
    'owner',
    'sha256:7c029b1a2201850c31f7521a32421298218074a6b0a16220b58f0ffd15140c42',
  ],
  [
    'a self-note',
    'self',
    'sha256:5f0650f6f74560c020da98d89ac4766e584c447bf2973e7f8e52c5ce83a4872d',
  ],
] as const)(
  'it hashes the proposal of %s as the release before subjects did',
  (_label, subject, hash) => {
    expect(
      buildProposalHash({
        operation: 'remember',
        itemID: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80',
        targetVersion: null,
        isPinned: false,
        text: 'I like tidy lists',
        quote: null,
        salt: 'c2FsdC1h',
        subject,
      }),
    ).toBe(hash);
  },
);

test('it hashes a shared proposal apart from the same proposal about the owner', () => {
  const operation = {
    operation: 'remember',
    itemID: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80',
    targetVersion: null,
    isPinned: false,
    text: 'The owner and the assistant call the kettle Captain Steam',
    quote: null,
    salt: 'c2FsdC1h',
  } as const;

  expect(buildProposalHash({ ...operation, subject: 'shared' })).not.toBe(
    buildProposalHash({ ...operation, subject: 'owner' }),
  );
});
