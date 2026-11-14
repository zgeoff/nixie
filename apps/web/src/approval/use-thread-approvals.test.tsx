import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { useThreadApprovals } from './use-thread-approvals';

test('it reads the state of every card in a thread with more than 100 cards', async () => {
  await createDeviceSession();

  const rows = await Promise.all(
    Array.from({ length: 101 }, () => store.approvalRows.create({ state: 'pending' })),
  );

  const records = rows.map((row, index) =>
    buildMockLogRecord({
      sequence: index + 1,
      proposal: { proposalID: row.proposalID, shortID: row.shortID },
    }),
  );

  const hook = renderHook(() => useThreadApprovals(records));

  await waitFor(() => {
    expect(hook.result.current.reads.size).toBe(101);
  });

  expect([...hook.result.current.reads.keys()].toSorted()).toStrictEqual(
    rows.map((row) => row.proposalID).toSorted(),
  );
});
