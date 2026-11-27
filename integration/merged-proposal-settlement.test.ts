import { expect, test } from 'bun:test';
import { proposalsProjection } from '@heynixie/api';
import { readRecords } from '@heynixie/log';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  memoryProjections,
  startMemoryStore,
} from '@heynixie/memory';
import { buildMockWriteCaller } from '@heynixie/memory/test-utils';
import type { StartedClaim } from '@heynixie/tasks';
import { writeStepError } from '@heynixie/tasks';
import {
  seedConversationStep,
  seedDefinitionTask,
  seedOpenDefinitionRun,
  startTestTasks,
} from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';

async function setupTest() {
  const tasks = await startTestTasks();

  const log = {
    ...tasks.context.log,
    projections: [...tasks.context.log.projections, ...memoryProjections, proposalsProjection],
  };

  const context = { ...tasks.context, log };

  const store = await startMemoryStore({
    log,
    definitions: context.definitions,
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: tasks.clock,
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  tasks.defer(() => store.stop());

  return {
    store,
    seed: {
      conversationStep: () => seedConversationStep(context),
      definitionTask: (definitionID: string) =>
        seedDefinitionTask(
          { ...tasks, context },
          {
            definitionID,
            definitionHash: `${definitionID}-1`,
            version: { name: 'Water the tomatoes', persona: 'none' },
          },
        ),
      openDefinitionRun: (taskID: string, definitionID: string) =>
        seedOpenDefinitionRun(context, {
          taskID,
          definitionID,
          definitionHash: `${definitionID}-1`,
        }),
    },
    rememberFromConversation: (text: string) =>
      store.writes.remember({ text, caller: buildMockWriteCaller({ thread: 'conversation' }) }),
    rememberFromTask: (text: string, taskID: string) =>
      store.writes.remember({
        text,
        caller: buildMockWriteCaller({ origin: 'task', thread: taskID, taskID }),
      }),

    // a definition task never closes, so a step error at the limit ends it
    failTask: (claim: StartedClaim) =>
      writeStepError(context, claim, {
        maxStepErrors: 1,
        retryDelayMs: 1000,
        maxRetryDelayMs: 1000,
        error: new Error('the step broke'),
      }),
    readSettlements: async () => {
      const settled = await readRecords(log, { afterSequence: 0, kinds: ['proposals.settled'] });

      return settled.map((entry) => ({
        thread: entry.record.thread,
        task: entry.record.payload['task'],
      }));
    },
  };
}

test('it settles a finished task that merged into an older proposal at the report target its task run pinned', async () => {
  const ctx = await setupTest();

  await ctx.seed.conversationStep();

  const opened = await ctx.rememberFromConversation('Keeps a rowing boat at the lake');

  invariant(opened.status === 'proposed', 'the first write opened a proposal');

  const taskID = await ctx.seed.definitionTask('water-the-tomatoes');
  const claim = await ctx.seed.openDefinitionRun(taskID, 'water-the-tomatoes');

  await ctx.rememberFromTask('Keeps a rowing boat at the lake', taskID);
  await ctx.failTask(claim);

  const [pending] = await ctx.store.proposals.listPending();

  invariant(pending?.proposalID === opened.proposalID, 'the task write merged into the proposal');

  await ctx.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const settlements = await ctx.readSettlements();

  expect(settlements).toStrictEqual([
    { thread: 'conversation', task: null },
    { thread: 'conversation', task: taskID },
  ]);
});
