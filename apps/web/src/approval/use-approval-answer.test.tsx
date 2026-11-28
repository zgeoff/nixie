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
  const answers: unknown[] = [];
  const windows: unknown[] = [];

  network.use(
    http.post('https://nixie.test/rpc/passkeys/window', async (info) => {
      const raw: unknown = await info.request.clone().json();

      windows.push(raw);

      return HttpResponse.json({ json: { isOpen: true }, meta: [] });
    }),
    http.post('https://nixie.test/rpc/approvals/answerProposal', async (info) => {
      const raw: unknown = await info.request.clone().json();

      answers.push(raw);

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

  return { hook, outcomes, clientActionIDs, answers, windows };
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

test('it sends a trust to read with its place hash and asks for no passkey', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  act(() => {
    ctx.hook.result.current.send({
      proposalID: 'proposal-1',
      actionHash: 'sha256:abc',
      choice: 'approve',
      trust: 'read',
      placeHash: 'sha256:place-read',
    });
  });

  await waitFor(() => {
    expect(ctx.outcomes).toHaveLength(1);
  });

  expect({ windows: ctx.windows, answers: ctx.answers }).toMatchObject({
    windows: [],
    answers: [{ json: { trust: 'read', placeHash: 'sha256:place-read' } }],
  });
});

test('it takes the passkey check for a trust to act, though the row lists no passkey choice', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  act(() => {
    ctx.hook.result.current.send({
      proposalID: 'proposal-1',
      actionHash: 'sha256:abc',
      choice: 'approve',
      trust: 'act',
      placeHash: 'sha256:place-act',
    });
  });

  await waitFor(() => {
    expect(ctx.outcomes).toHaveLength(1);
  });

  expect(ctx.windows).toMatchObject([
    { json: { for: { kind: 'answer', trust: 'act', placeHash: 'sha256:place-act' } } },
  ]);
});
