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

test('it hashes an edit that moves its item to another subject apart from the same edit that keeps it', () => {
  const operation = {
    operation: 'remember',
    itemID: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80',
    targetVersion: 2,
    isPinned: false,
    text: 'The owner and the assistant call the kettle Captain Steam',
    quote: null,
    salt: 'c2FsdC1h',
    subject: 'owner',
  } as const;

  expect(buildProposalHash({ ...operation, newSubject: 'shared' })).not.toBe(
    buildProposalHash(operation),
  );
});

test('it hashes proposals that differ only in their end time apart', () => {
  const operation = {
    operation: 'remember',
    itemID: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80',
    targetVersion: null,
    isPinned: false,
    text: 'Is in Lisbon this week',
    quote: null,
    salt: 'c2FsdC1h',
  } as const;

  expect(buildProposalHash({ ...operation, until: 1200 })).not.toBe(
    buildProposalHash({ ...operation, until: 1300 }),
  );
});

test('it hashes a sensitive proposal apart from the same proposal with no mark', () => {
  const operation = {
    operation: 'remember',
    itemID: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80',
    targetVersion: null,
    isPinned: false,
    text: 'Lives at 12 Juniper Row',
    quote: null,
    salt: 'c2FsdC1h',
  } as const;

  expect(buildProposalHash({ ...operation, isSensitive: true })).not.toBe(
    buildProposalHash(operation),
  );
});

test('it hashes a proposal marked not sensitive as the release before sensitive marks did', () => {
  expect(
    buildProposalHash({
      operation: 'remember',
      itemID: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80',
      targetVersion: null,
      isPinned: false,
      text: 'I like tidy lists',
      quote: null,
      salt: 'c2FsdC1h',
      isSensitive: false,
    }),
  ).toBe('sha256:7c029b1a2201850c31f7521a32421298218074a6b0a16220b58f0ffd15140c42');
});

test('it hashes a proposal with a null end time as the release before end times did', () => {
  expect(
    buildProposalHash({
      operation: 'remember',
      itemID: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80',
      targetVersion: null,
      isPinned: false,
      text: 'I like tidy lists',
      quote: null,
      salt: 'c2FsdC1h',
      until: null,
    }),
  ).toBe('sha256:7c029b1a2201850c31f7521a32421298218074a6b0a16220b58f0ffd15140c42');
});
