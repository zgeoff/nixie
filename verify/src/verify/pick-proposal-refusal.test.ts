import { expect, test } from 'bun:test';
import { pickProposalRefusal } from './pick-proposal-refusal';

test('#pickProposalRefusal accepts one pending call of the tool', () => {
  const proposals = [
    { proposalID: 'kestrel01', tool: 'memory.export' },
    { proposalID: 'kestrel02', tool: 'memory.retire' },
  ];

  expect(pickProposalRefusal(proposals, { tool: 'memory.export', waiting: 'pending' })).toBeNull();
});

test('#pickProposalRefusal refuses pending when no call of the tool waits', () => {
  expect(pickProposalRefusal([], { tool: 'memory.export', waiting: 'pending' })).toBe(
    'held calls of memory.export that wait for an answer: 0, not 1',
  );
});

test('#pickProposalRefusal accepts none once the call has its answer', () => {
  expect(pickProposalRefusal([], { tool: 'memory.export', waiting: 'none' })).toBeNull();
});

test('#pickProposalRefusal refuses none while a call of the tool waits', () => {
  const proposals = [{ proposalID: 'kestrel01', tool: 'memory.export' }];

  expect(pickProposalRefusal(proposals, { tool: 'memory.export', waiting: 'none' })).toBe(
    'held calls of memory.export that wait for an answer: 1, not 0',
  );
});
