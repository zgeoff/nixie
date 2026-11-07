import { expect, mock, test } from 'bun:test';
import { countTextTokens } from '@heynixie/compaction';
import {
  buildMockSandboxSpec,
  buildStubGuestSandboxes,
  setupTestRecorder,
} from '@heynixie/sandbox/test-utils';
import { runTaskStep } from '@heynixie/tasks';
import { seedConversationStep } from '@heynixie/tasks/test-utils';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeReplacedSession } from './write-replaced-session';

async function setupTest() {
  const tasks = await startTestTasks();
  const recorder = await setupTestRecorder();

  const stub = buildStubGuestSandboxes({
    recorder: recorder.recorder,
    countTokens: countTextTokens,
  });

  return {
    context: tasks.context,
    adapter: stub.adapter,
    spec: buildMockSandboxSpec({ kind: 'conversation', owner: 'conversation' }),
    seedSessionBoundary: async (boundary: string) => {
      const step = await seedConversationStep(tasks.context);

      await runTaskStep(tasks.context, step.claim, {
        runStep: (input) =>
          Promise.resolve({
            next: 'wait',
            records: [],
            acknowledged: input.inbox.map((record) => record.sequence),
            sessionBoundary: boundary,
          }),
        leaseMs: 60_000,
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });
    },
  };
}

test('it carries the session files the harness lists into the replacement sandbox', async () => {
  const ctx = await setupTest();
  const from = await ctx.adapter.create(ctx.spec);
  const to = await ctx.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();

  await ctx.seedSessionBoundary(
    JSON.stringify({ harness: 'agent-sdk', sessionID, messageID: crypto.randomUUID() }),
  );

  await from.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"a"}\n'),
    },
  ]);

  await writeReplacedSession({
    context: ctx.context,
    command: { argv: ['guest'], env: { HOME: '/home/nixie' } },
    listSessionFiles: (point) => [`${point.sessionID}.jsonl`],
    log: mock(),
    replaced: [from],
    target: to,
  });

  const landed = await to.readFilePaths('/home/nixie/.claude/projects');

  expect(landed).toStrictEqual([`-home-nixie-conversation/${sessionID}.jsonl`]);
});

test('it carries nothing for a harness that keeps no session a new sandbox can resume', async () => {
  const ctx = await setupTest();
  const from = await ctx.adapter.create(ctx.spec);
  const to = await ctx.adapter.create(ctx.spec);

  const sessionID = crypto.randomUUID();

  await ctx.seedSessionBoundary(
    JSON.stringify({ harness: 'agent-sdk', sessionID, messageID: crypto.randomUUID() }),
  );

  await from.copyIn([
    {
      path: `/home/nixie/.claude/projects/-home-nixie-conversation/${sessionID}.jsonl`,
      content: new TextEncoder().encode('{"uuid":"a"}\n'),
    },
  ]);

  const log = mock();

  await writeReplacedSession({
    context: ctx.context,
    command: { argv: ['guest'], env: { HOME: '/home/nixie' } },
    listSessionFiles: null,
    log,
    replaced: [from],
    target: to,
  });

  const landed = await to.readFilePaths('/home/nixie/.claude/projects');

  expect(landed).toStrictEqual([]);
  expect(log).not.toHaveBeenCalled();
});
