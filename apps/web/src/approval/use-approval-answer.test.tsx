import { expect, test } from 'bun:test';
import { network } from '@heynixie/mock-server';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { z } from 'zod';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderHook } from '../test-utils/render-hook';
import type { ApprovalOutcome } from './use-approval-answer';
import { useApprovalAnswer } from './use-approval-answer';

function setupTest() {
  const outcomes: ApprovalOutcome[] = [];
  const clientActionIDs: string[] = [];

  network.use(
    http.post('https://nixie.test/rpc/approvals/answerProposal', async (info) => {
      const raw: unknown = await info.request.clone().json();

      const schema = z.object({ json: z.object({ clientActionID: z.string() }) });
      const body = schema.parse(raw);

      clientActionIDs.push(body.json.clientActionID);

      return HttpResponse.json(
        {
          json: {
            defined: true,
            code: 'CLIENT_ACTION_ID_REUSED',
            status: 409,
            message: 'The client action ID belongs to a different action',
          },
          meta: [],
        },
        { status: 409 },
      );
    }),
  );

  const hook = renderHook(() =>
    useApprovalAnswer({
      passkeyChoices: [],
      onOutcome: (outcome) => {
        outcomes.push(outcome);
      },
    }),
  );

  return { hook, outcomes, clientActionIDs };
}

test('it reads the refusal of a reused client action ID as its own reason', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  act(() => {
    ctx.hook.result.current.send({
      proposalID: 'proposal-1',
      actionHash: 'sha256:abc',
      choice: 'approve',
    });
  });

  await waitFor(() => {
    expect(ctx.outcomes).toStrictEqual([{ status: 'refused', reason: 'client_action_id_reused' }]);
  });
});

test('it sends the next try after a reused client action ID under a new one', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  act(() => {
    ctx.hook.result.current.send({
      proposalID: 'proposal-1',
      actionHash: 'sha256:abc',
      choice: 'approve',
    });
  });

  await waitFor(() => {
    expect(ctx.outcomes).toHaveLength(1);
  });

  act(() => {
    ctx.hook.result.current.send({
      proposalID: 'proposal-1',
      actionHash: 'sha256:abc',
      choice: 'approve',
    });
  });

  await waitFor(() => {
    expect(ctx.outcomes).toHaveLength(2);
  });

  expect(new Set(ctx.clientActionIDs).size).toBe(2);
});
