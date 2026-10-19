import { expect, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useProposalAnswers } from './use-proposal-answers';

async function setupTest() {
  // every answer needs a signed-in browser
  await createDeviceSession();
}

test('it keeps the outcome of an answer that changed nothing, with the text of its proposal', async () => {
  await setupTest();

  const proposal = await store.memoryProposals.create({
    lapseAt: new Date(Date.now() - 1000),
    text: 'Keeps bees on the roof',
  });

  const hook = renderHook(() => useProposalAnswers());

  act(() => {
    hook.result.current.approve([
      {
        proposal: {
          actionHash: proposal.actionHash,
          createdAt: proposal.createdAt,
          evidence: null,
          isPinned: false,
          itemID: proposal.itemID,
          kind: 'fact',
          lapseAt: proposal.lapseAt,
          operation: 'remember',
          origin: 'memory_writer',
          proposalID: proposal.proposalID,
          quote: null,
          reason: 'no_quote',
          source: 'untrusted',
          sources: [],
          subject: 'owner',
          targetVersion: null,
          text: 'Keeps bees on the roof',
        },
      },
    ]);
  });

  await waitFor(() => {
    expect(hook.result.current.outcomes[proposal.proposalID]).toStrictEqual({
      outcome: { cause: 'lapsed', proposalID: proposal.proposalID, status: 'stale' },
      text: 'Keeps bees on the roof',
    });
  });
});

test('it sends the answers of a failed call again once you retry', async () => {
  await setupTest();

  const proposal = await store.memoryProposals.create({ text: 'Keeps bees on the roof' });

  server.use(http.post('*/rpc/memory/rejectProposals', () => HttpResponse.error(), { once: true }));

  const hook = renderHook(() => useProposalAnswers());

  act(() => {
    hook.result.current.reject([
      {
        proposal: {
          actionHash: proposal.actionHash,
          createdAt: proposal.createdAt,
          evidence: null,
          isPinned: false,
          itemID: proposal.itemID,
          kind: 'fact',
          lapseAt: proposal.lapseAt,
          operation: 'remember',
          origin: 'memory_writer',
          proposalID: proposal.proposalID,
          quote: null,
          reason: 'no_quote',
          source: 'untrusted',
          sources: [],
          subject: 'owner',
          targetVersion: null,
          text: 'Keeps bees on the roof',
        },
        reason: 'the bees were a neighbour',
      },
    ]);
  });

  await waitFor(() => {
    expect(hook.result.current.isError).toBeTrue();
  });

  act(() => {
    hook.result.current.retry();
  });

  await waitFor(() => {
    expect(store.records.all().map((record) => record.answer?.reason)).toStrictEqual([
      'the bees were a neighbour',
    ]);
  });
});

test('it sends more answers than one call takes over several calls, and approves each', async () => {
  await setupTest();

  const proposals = await Promise.all(
    Array.from({ length: 51 }, () => store.memoryProposals.create({})),
  );

  const hook = renderHook(() => useProposalAnswers());

  act(() => {
    hook.result.current.approve(
      proposals.map((proposal) => ({
        proposal: {
          actionHash: proposal.actionHash,
          createdAt: proposal.createdAt,
          evidence: null,
          isPinned: false,
          itemID: proposal.itemID,
          kind: 'fact',
          lapseAt: proposal.lapseAt,
          operation: 'remember',
          origin: 'memory_writer',
          proposalID: proposal.proposalID,
          quote: null,
          reason: 'no_quote',
          source: 'untrusted',
          sources: [],
          subject: 'owner',
          targetVersion: null,
          text: proposal.text,
        },
      })),
    );
  });

  await waitFor(() => {
    expect(
      store.records.findMany((query) => query.where({ kind: 'memory.approval_recorded' })),
    ).toHaveLength(51);
  });
});
