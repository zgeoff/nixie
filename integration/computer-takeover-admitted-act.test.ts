import { expect, onTestFinished, test } from 'bun:test';
import { runInStepActions, startActionRunners } from '@heynixie/actions';
import {
  buildActionSeeder,
  createTestStep,
  queueTestAction,
  readTestAction,
  startTestActions,
} from '@heynixie/actions/test-utils';
import type { TakeOverResult } from '@heynixie/connectors';
import { buildComputerTools, startComputer } from '@heynixie/connectors';
import { buildStubSandboxAdapter } from '@heynixie/connectors/test-utils';
import { readRecords } from '@heynixie/log';
import { stopWithoutGrace, waitForCondition } from '@heynixie/testing';
import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  const requests: ComputerRequest[] = [];

  const replies: Partial<Record<ComputerRequest['op'], ComputerReply>> = {
    run: {
      kind: 'run',
      ok: true,
      run: {
        exitCode: 0,
        stdout: { text: 'notes.txt\n', isCut: false },
        stderr: { text: '', isCut: false },
        seconds: 0.1,
        isDiskNew: false,
      },
    },
    writeFile: {
      kind: 'written',
      ok: true,
      path: '/home/computer/files/notes.txt',
      bytes: 5,
      isDiskNew: false,
    },
  };

  const adapter = buildStubSandboxAdapter(async (stdin, stdout) => {
    await runComputerGuest(
      { input: stdin, write: (bytes) => stdout.write(bytes) },
      (request) => {
        requests.push(request);

        return Promise.resolve(replies[request.op] ?? { kind: 'closed', ok: true });
      },
      1_000_000,
      { onReady: () => {}, onVNCFrame: () => {} },
    );

    return 0;
  });

  const computer = startComputer({
    adapter,
    image: 'computer-image',
    argv: ['guest'],
    scans: {
      scan: () => Promise.resolve({ kind: 'pass' as const }),
      scanText: () => Promise.resolve({ kind: 'pass' as const }),
    },
    deniedRanges: [],
    timeZone: 'Pacific/Auckland',
    logger: () => {},
    clock: createFakeClock({ startMs: 0 }),
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  const tools = buildComputerTools({
    computer,
    log: actions.context.log,
    findSecret: () => null,
    isOwnerTyped: () => Promise.resolve(false),
    logger: () => {},
    deniedRanges: [],
    fetch: {
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 20_000, imageBytes: 100 },
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
      secretTypedURLCovers: 'redirects',
    },
  });

  const findTool = (name: string) => {
    const tool = tools.tools.find((candidate) => candidate.name === name);

    invariant(tool, `no tool ${name}`);

    return tool;
  };

  // the take-over that begins as the attempt's call is admitted, before the attempt commits
  const takeOver: {
    result: Promise<TakeOverResult> | null;
    opsAtStart: readonly ComputerRequest['op'][] | null;
  } = { result: null, opsAtStart: null };

  const startTakeOver = async () => {
    const result = await computer.takeover.start('laptop');

    takeOver.opsAtStart = requests.map((request) => request.op);

    return result;
  };

  const admitThenTakeOver = () => {
    const admission = computer.takeover.admit();

    if (admission !== null && takeOver.result === null) {
      takeOver.result = startTakeOver();
    }

    return admission;
  };

  const runContext = {
    callSequence: 1,
    run: {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: [],
      model: { model: 'model-a', profile: 'chat-direct' },
      session: { key: 'session-a', invalidatedThrough: 0 },
    },
  };

  return {
    actions,
    step,
    computer,
    tools,
    requests,
    takeOver,
    seed: buildActionSeeder({ context: actions.context }),
    queueRun: async () => {
      const input = { command: 'ls' };

      await findTool('computer.run').prepare?.(input, runContext);

      return queueTestAction(actions.context, {
        step,
        tool: 'computer.run',
        actionHash: 'sha256:run-1',
        arguments: input,
        decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
      });
    },
    startRunner: () =>
      startActionRunners(actions.context, {
        connectors: new Map([['computer.run', tools.connector]]),
        readHeldToolPrefixes: () => (computer.takeover.isHeld() ? ['computer.'] : []),
        admitTool: admitThenTakeOver,
        onError: () => {},
      }),
    runStep: () =>
      runInStepActions(actions.context, step.lease, {
        admitTool: admitThenTakeOver,
        readHeldToolPrefixes: () => (computer.takeover.isHeld() ? ['computer.'] : []),
        runCall: async (request) => {
          // the approved call reads its stored call from the log first, as the step's run does
          await readRecords(actions.context.log, { afterSequence: 0, limit: 1 });

          const outcome = await findTool(request.tool).run(
            { callID: 'call-1', tool: request.tool, input: request.input, toolUseID: null },
            runContext,
          );

          invariant(outcome.status === 'ok', 'the tool answers');

          return {
            status: 'done',
            resultSequence: 7,
            result: outcome.result,
            images: [],
          };
        },
      }),
  };
}

test('it runs a queued act once when a take-over starts between its admission and its commit, and the take-over waits for it', async () => {
  const ctx = await setupTest();
  const queued = await ctx.queueRun();

  const runners = ctx.startRunner();

  onTestFinished(() => stopWithoutGrace(ctx.actions.clock, runners));

  await waitForCondition(() => ctx.takeOver.opsAtStart !== null);

  await waitForCondition(async () => {
    const action = await readTestAction(ctx.actions.writer, queued.actionID);

    return action.status !== 'pending';
  });

  const action = await readTestAction(ctx.actions.writer, queued.actionID);
  const result = await ctx.takeOver.result;

  expect([ctx.takeOver.opsAtStart, action.status, action.attempt_count, result]).toStrictEqual([
    ['run', 'takeoverBegin'],
    'done',
    1,
    { kind: 'started', takenOverAt: 0 },
  ]);
});

test('it runs an in-step act once when a take-over starts between its admission and its commit, and the take-over waits for it', async () => {
  const ctx = await setupTest();

  const queued = await ctx.seed.inStepAction({
    step: ctx.step,
    tool: 'computer.write_file',
    arguments: { path: 'notes.txt', text: 'hello' },
  });

  const settled = await ctx.runStep();

  await waitForCondition(() => ctx.takeOver.opsAtStart !== null);

  const action = await readTestAction(ctx.actions.writer, queued.action_id);
  const result = await ctx.takeOver.result;

  expect([
    settled.map((entry) => entry.reply),
    ctx.takeOver.opsAtStart,
    action.status,
    action.attempt_count,
    result,
  ]).toStrictEqual([
    [
      {
        result: { path: '/home/computer/files/notes.txt', bytes: 5, isDiskNew: false },
        images: [],
      },
    ],
    ['writeFile', 'takeoverBegin'],
    'done',
    1,
    { kind: 'started', takenOverAt: 0 },
  ]);
});
