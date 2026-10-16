import { expect, test } from 'bun:test';
import { memoryViewContract } from './memory-view-contract';

test('it refuses a retirement without its client action ID', () => {
  expect(
    memoryViewContract.retire['~orpc'].inputSchema?.safeParse({ itemID: 'item-a', version: 2 })
      .error?.issues,
  ).toPartiallyContain({ path: ['clientActionID'] });
});

test('it refuses a pin without the version the view showed', () => {
  expect(
    memoryViewContract.pin['~orpc'].inputSchema?.safeParse({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      isPinned: true,
      itemID: 'item-a',
    }).error?.issues,
  ).toPartiallyContain({ path: ['version'] });
});

test('it declares a missing session, a store not started, a reused ID, a missing item, a stale version and a wrong state for a restore', () => {
  expect(memoryViewContract.restore['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'MEMORY_NOT_STARTED',
    'CLIENT_ACTION_ID_REUSED',
    'MEMORY_ITEM_NOT_FOUND',
    'STALE_VERSION',
    'WRONG_STATE',
  ]);
});

test('it declares a full pinned core for a pin', () => {
  expect(memoryViewContract.pin['~orpc'].errorMap).toContainKey('PINNED_CORE_FULL');
});

test('it answers a stale version with 409', () => {
  expect(memoryViewContract.retire['~orpc'].errorMap.STALE_VERSION.status).toBe(409);
});

test('it declares a missing session and a store not started for a search', () => {
  expect(memoryViewContract.findItems['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'MEMORY_NOT_STARTED',
  ]);
});

test('it declares an unknown cursor for a page of items', () => {
  expect(memoryViewContract.listItems['~orpc'].errorMap).toContainKey('INVALID_CURSOR');
});

test('it declares a missing item for an item read', () => {
  expect(memoryViewContract.readItem['~orpc'].errorMap).toContainKey('MEMORY_ITEM_NOT_FOUND');
});

test('it refuses an approval without its client action ID', () => {
  expect(
    memoryViewContract.approveProposals['~orpc'].inputSchema?.safeParse({
      answers: [{ actionHash: 'sha256:a1', proposalID: 'proposal-a' }],
    }).error?.issues,
  ).toPartiallyContain({ path: ['answers', 0, 'clientActionID'] });
});

test('it refuses an approval of no proposal', () => {
  expect(
    memoryViewContract.approveProposals['~orpc'].inputSchema?.safeParse({ answers: [] }).error
      ?.issues,
  ).toPartiallyContain({ path: ['answers'] });
});

test('it refuses a rejection whose reason is only spaces', () => {
  expect(
    memoryViewContract.rejectProposals['~orpc'].inputSchema?.safeParse({
      answers: [
        {
          actionHash: 'sha256:a1',
          clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
          proposalID: 'proposal-a',
          reason: '   ',
        },
      ],
    }).error?.issues,
  ).toPartiallyContain({ path: ['answers', 0, 'reason'] });
});

test('it refuses a rejection whose reason passes 500 characters', () => {
  expect(
    memoryViewContract.rejectProposals['~orpc'].inputSchema?.safeParse({
      answers: [
        {
          actionHash: 'sha256:a1',
          clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
          proposalID: 'proposal-a',
          reason: 'x'.repeat(501),
        },
      ],
    }).error?.issues,
  ).toPartiallyContain({ path: ['answers', 0, 'reason'] });
});

test('it declares a missing session and a store not started for a proposal list', () => {
  expect(memoryViewContract.listProposals['~orpc'].errorMap).toContainAllKeys([
    'UNAUTHORIZED',
    'MEMORY_NOT_STARTED',
  ]);
});
