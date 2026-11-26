import { expect, test } from 'bun:test';
import { createRouterClient } from '@orpc/server';
import { startTestAPI } from '../test-utils/start-test-api';
import { createHostNixieProcedures } from './create-host-nixie-procedures';
import { createHostSpendProcedures } from './create-host-spend-procedures';
import { createHostTaskProcedures } from './create-host-task-procedures';

interface TestOptions {
  readonly isSpendOn: boolean;
}

async function setupTest(options: TestOptions) {
  const api = await startTestAPI(undefined, options);

  return {
    ...api,
    spend: createRouterClient(createHostSpendProcedures(api.context)),
    nixie: createRouterClient(createHostNixieProcedures(api.context)),
    tasks: createRouterClient(createHostTaskProcedures(api.context)),
  };
}

test('#spend.raise writes the host as the actor and answers the turns in force', async () => {
  const ctx = await setupTest({ isSpendOn: true });
  const raised = await ctx.spend.raise({ turns: 9 });

  expect(raised).toStrictEqual({
    start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
    turns: 9,
  });
});

test('#spend.raise refuses a config with no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });

  const raise = ctx.spend.raise({ turns: 9 });

  await Promise.allSettled([raise]);

  expect(raise).rejects.toMatchObject({ code: 'SPEND_NOT_CONFIGURED' });
});

test('#nixie.resume is refused while the stop stands', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const resume = ctx.nixie.resume();

  await Promise.allSettled([resume]);

  expect(resume).rejects.toMatchObject({ code: 'SPEND_STOP_STANDS' });
});

test('#tasks.resume is refused while the stop stands', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const resume = ctx.tasks.resume({ taskID: 'task-a' });

  await Promise.allSettled([resume]);

  expect(resume).rejects.toMatchObject({ code: 'SPEND_STOP_STANDS' });
});
