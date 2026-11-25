import { expect, test } from 'bun:test';
import { writeUnknownAnswer } from '@heynixie/actions';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import type { RunStep } from '@heynixie/tasks';
import { claimTask, runTaskStep, writeTaskControl } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { readBinding } from '../session/read-binding';
import { makeCodingStep } from '../step/make-coding-step';
import { startTestCoding } from '../test-utils/start-test-coding';
import { runCodingSweep } from './run-coding-sweep';

async function setupTest() {
  const ctx = await startTestCoding();
  const claim = await ctx.claimConversation();

  return {
    ...ctx,
    seed: {
      startedTask: (): Promise<string> =>
        ctx.startTask(claim, {
          name: 'Fix the flaky login test',
          brief: 'Find why the login test fails.',
          repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
        }),

      // a task the conversation started, which starts the coding task from its own step
      startedByTask: async (): Promise<{ starterID: string; taskID: string }> => {
        const starterID = await ctx.startSandboxTask(claim, {
          name: 'Tidy the login code',
          brief: 'Start a coding task for the login test.',
        });

        const starterClaim = await claimTask(ctx.context, {
          holder: 'runner-a',
          leaseMs: 60_000,
          taskID: starterID,
        });

        invariant(starterClaim, 'the started task is ready to claim');

        const taskID = await ctx.startTask(starterClaim, {
          name: 'Fix the flaky login test',
          brief: 'Find why the login test fails.',
          repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
        });

        return { starterID, taskID };
      },

      // joins the one session the fake holds
      joinedTask: async (): Promise<string> => {
        const listed = await ctx.callTool(claim, 'coding.sessions', {});

        const shortID = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'];

        return ctx.startTask(claim, {
          name: 'Your billing refactor',
          brief: 'Watch for a question.',
          session: shortID ?? '',
        });
      },
    },
    readBinding: (taskID: string) => readBinding(ctx.log.writer.db, taskID),
    forgetSpawnOutcome: async (taskID: string) => {
      const [outcome] = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['action.outcome'],
      });

      await removeTestRecordKey(ctx.log, outcome?.record.sequence ?? 0);
    },
    stop: (taskID: string) => writeTaskControl(ctx.context, { taskID, control: 'stop' }),
    close: (taskID: string) => writeTaskControl(ctx.context, { taskID, control: 'close' }),
    sweep: () => runCodingSweep(ctx.coding, ctx.adapter),
    readReports: async (taskID: string) => {
      const messages = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: 'conversation',
        kinds: ['task_message'],
      });

      return messages
        .filter((entry) => entry.record.payload['from'] === taskID)
        .map((entry) => ({
          kind: entry.record.payload['kind'],
          wake: entry.record.payload['wake'],
          erasable: entry.record.erasable,
        }));
    },

    // the user answers that the unknown spawn of the task happened
    answerHappened: async (taskID: string) => {
      const [outcome] = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['action.outcome'],
      });

      const actionID = z.string().parse(outcome?.record.payload['actionID']);

      return withWriteTransaction(ctx.log.writer, (tx) =>
        writeUnknownAnswer(tx, ctx.context, {
          actionID,
          choice: 'happened',
          identityID: 'owner',
        }),
      );
    },

    // runs one step of the coding task, which runs the callback after the step read its inbox and
    // before its commit
    runStepThen: async (taskID: string, after: () => Promise<unknown>) => {
      const codingStep = makeCodingStep(ctx.coding, ctx.adapter);

      const runStep: RunStep = async (input) => {
        const result = await codingStep(input);

        await after();

        return result;
      };

      const taskClaim = await claimTask(ctx.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        taskID,
      });

      invariant(taskClaim, 'the coding task is ready to claim');

      await runTaskStep(ctx.context, taskClaim, {
        runStep,
        leaseMs: 60_000,
        logger: () => {},
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });
    },
    readLostRecords: async (taskID: string) => {
      const records = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['coding.session_lost'],
      });

      return records.map((entry) => entry.record.payload);
    },
    readStopCalls: () => ctx.adapter.calls.filter((call) => call.method === 'stop'),
  };
}

test('it reports a started session once when a forget erased its ID before the stopped task bound it', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedTask();

  await ctx.runActions();
  await ctx.forgetSpawnOutcome(taskID);
  await ctx.stop(taskID);
  await ctx.sweep();
  await ctx.sweep();

  expect({
    reports: await ctx.readReports(taskID),
    calls: ctx.readStopCalls(),
  }).toStrictEqual({
    reports: [
      {
        kind: 'progress',
        wake: true,
        erasable: {
          status: 'readable',
          fields: {
            body:
              'The coding session this task started may still be running, but nixie cannot find ' +
              "its ID, so it could not stop it. Find it in atc's own list of sessions, or join it " +
              'by calling coding.start with its session ID.',
          },
        },
      },
    ],
    calls: [],
  });
});

test('it records a lost session once on the thread of the task when its starter has finished', async () => {
  const ctx = await setupTest();
  const started = await ctx.seed.startedByTask();

  await ctx.runActions();
  await ctx.forgetSpawnOutcome(started.taskID);
  await ctx.stop(started.taskID);
  await ctx.close(started.starterID);
  await ctx.sweep();
  await ctx.sweep();

  expect({
    lost: await ctx.readLostRecords(started.taskID),
    logged: ctx.logged,
  }).toStrictEqual({
    lost: [{ taskID: started.taskID, adapter: 'atc', actionID: expect.toBeString() }],
    logged: [
      {
        event: 'coding.lost_session_unreported',
        fields: { taskID: started.taskID, reason: 'finished' },
      },
    ],
  });
});

test('it reports a lost session when the task sent another message after the answer that the spawn happened', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedTask();

  ctx.adapter.replyNext('start', { status: 'unknown', reason: 'timeout' });
  ctx.adapter.replyNext('start', { status: 'unknown', reason: 'timeout' });
  ctx.adapter.replyNext('start', { status: 'unknown', reason: 'timeout' });

  await ctx.runActions();
  await ctx.runStepThen(taskID, () => ctx.answerHappened(taskID));
  await ctx.stop(taskID);
  await ctx.sweep();

  const reports = await ctx.readReports(taskID);

  expect({
    lost: await ctx.readLostRecords(taskID),
    reports: reports
      .filter((report) => report.kind === 'progress')
      .map((report) => report.erasable),
  }).toStrictEqual({
    lost: [{ taskID, adapter: 'atc', actionID: expect.toBeString() }],
    reports: [
      {
        status: 'readable',
        fields: {
          body: 'nixie asked the user whether the coding session started, because its start may have failed.',
        },
      },
      {
        status: 'readable',
        fields: {
          body:
            'The coding session this task started may still be running, but nixie cannot find ' +
            "its ID, so it could not stop it. Find it in atc's own list of sessions, or join it " +
            'by calling coding.start with its session ID.',
        },
      },
    ],
  });
});

test('it sends no report of its own for a spawn whose outcome a step already read before the task closed', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.startedTask();

  await ctx.runActions();
  await ctx.forgetSpawnOutcome(taskID);
  await ctx.runSteps();
  await ctx.close(taskID);

  const before = await ctx.readReports(taskID);

  await ctx.sweep();

  const after = await ctx.readReports(taskID);

  expect(after).toStrictEqual(before);
});

test('it leaves a session that another task joined first when the task that spawned it closes', async () => {
  const ctx = await setupTest();
  const spawnerID = await ctx.seed.startedTask();

  await ctx.runActions();

  const joinerID = await ctx.seed.joinedTask();

  await ctx.runSteps();
  await ctx.close(spawnerID);
  await ctx.sweep();
  await ctx.runActions();

  expect({
    spawner: await ctx.readBinding(spawnerID),
    joiner: await ctx.readBinding(joinerID),
    calls: ctx.readStopCalls(),
  }).toStrictEqual({
    spawner: null,
    joiner: expect.objectContaining({
      sessionID: 'cloud.3f9a1c2e.00000001',
      origin: 'joined',
      unboundAt: null,
    }),
    calls: [],
  });
});
