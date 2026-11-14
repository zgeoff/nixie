import { expect, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { z } from 'zod';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import { useApprovalDigest } from './use-approval-digest';

function setupTest() {
  const readSizes: number[] = [];
  const ids = z.array(z.string());
  const schema = z.object({ json: z.object({ proposalIDs: ids }) });

  server.use(
    http.post('*/rpc/approvals/readProposals', async (info) => {
      const raw: unknown = await info.request.clone().json();

      const body = schema.parse(raw);

      readSizes.push(body.json.proposalIDs.length);
    }),
  );

  return { readSizes };
}

test('it reads 101 rows that left the list in reads of at most 100 and shows each as answered', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rows = await Promise.all(
    Array.from({ length: 101 }, () => store.approvalRows.create({ state: 'pending' })),
  );

  const hook = renderHook(() => useApprovalDigest());

  await waitFor(() => {
    expect(hook.result.current.entries).toHaveLength(101);
  });

  await Promise.all(
    rows.map((row) =>
      store.approvalRows.update(row, {
        data(draft) {
          draft.state = 'approved';
        },
      }),
    ),
  );

  act(() => {
    hook.result.current.refresh();
  });

  await waitFor(() => {
    expect(ctx.readSizes.toSorted((left, right) => left - right)).toStrictEqual([1, 100]);
  });

  await waitFor(() => {
    expect(hook.result.current.entries.map((entry) => entry.item.proposal.state)).toSatisfyAll(
      (state: string) => state === 'approved',
    );
  });
});
