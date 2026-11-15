import { expect, test } from 'bun:test';
import { readMockApprovalProposals } from './read-mock-approval-proposals';
import { store } from './store';

test('it reads a closed row with no choices and the device that answered it', async () => {
  const kitchen = await store.sessions.create({ deviceName: 'kitchen tablet' });
  const laptop = await store.sessions.create({ deviceName: 'laptop' });

  const row = await store.approvalRows.create({
    answeredBy: kitchen.sessionID,
    state: 'approved',
  });

  const fromLaptop = readMockApprovalProposals([row.proposalID], laptop.sessionID);
  const fromKitchen = readMockApprovalProposals([row.proposalID], kitchen.sessionID);

  expect({
    laptop: fromLaptop.map((read) => [read.choices, read.answeredOn, read.isAnsweredHere]),
    kitchen: fromKitchen.map((read) => [read.choices, read.answeredOn, read.isAnsweredHere]),
  }).toStrictEqual({
    laptop: [[[], 'kitchen tablet', false]],
    kitchen: [[[], 'kitchen tablet', true]],
  });
});

test('it reads an open row by its short ID with its choices', async () => {
  const session = await store.sessions.create({});
  const row = await store.approvalRows.create({ shortID: 'k3x9m2p7qa' });

  const read = readMockApprovalProposals(['k3x9m2p7qa'], session.sessionID);

  expect(read.map((entry) => [entry.proposal.proposalID, entry.choices])).toStrictEqual([
    [row.proposalID, ['approve', 'defer', 'decline']],
  ]);
});

test('it reads no body for a row whose body is gone', async () => {
  const session = await store.sessions.create({});
  const row = await store.approvalRows.create({ isBodyGone: true });

  const read = readMockApprovalProposals([row.proposalID], session.sessionID);

  expect(read.map((entry) => entry.body)).toStrictEqual([null]);
});
