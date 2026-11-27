import { expect, onTestFinished, test } from 'bun:test';
import { readTestActions } from '@heynixie/actions/test-utils';
import { buildATCAdapter } from '@heynixie/coding-atc';
import { buildMemoryCursorStore, startFakeATCGateway } from '@heynixie/coding-atc/test-utils';
import { startTestCodingOn } from '@heynixie/coding/test-utils';
import { writeTaskControl } from '@heynixie/tasks';
import { buildSchemaParser } from '@heynixie/tools';
import invariant from 'tiny-invariant';

async function setupTest() {
  const gateway = startFakeATCGateway();

  onTestFinished(() => gateway.stop());

  const adapter = buildATCAdapter({
    url: gateway.url,
    token: gateway.token,
    cursors: buildMemoryCursorStore(),
    targets: [
      { daemon: 'laptop', target: 'local' },
      { daemon: 'cloud', target: 'cloud' },
    ],
    log: () => {},
  });

  const ctx = await startTestCodingOn(adapter);
  const claim = await ctx.claimConversation();

  const joinSession = async (): Promise<string> => {
    const listed = await ctx.callTool(claim, 'coding.sessions', {});

    const session = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'];

    const taskID = await ctx.startTask(claim, {
      name: 'Your billing refactor',
      brief: 'Watch for a question.',
      session,
    });

    await ctx.runActions();
    await ctx.runSteps();

    return taskID;
  };

  return { ...ctx, gateway, claim, joinSession };
}

test('#coding.sessions lists the sessions of a configured target from the gateway, with a short ID', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.7c1d0e55', name: 'billing refactor' });

  const listed = await ctx.callTool(ctx.claim, 'coding.sessions', {});

  expect(listed.outcome).toStrictEqual({
    status: 'ok',
    result: {
      sessions: [
        {
          id: expect.any(String),
          name: 'billing refactor',
          state: 'running',
          target: 'cloud/cloud',
          cwd: '/work/cloud.3f9a1c2e.7c1d0e55',
          boundTo: null,
        },
      ],
    },
  });
});

test('#coding.sessions gives an error outcome with the reason when a configured daemon is not in the gateway registry', async () => {
  const ctx = await setupTest();

  ctx.gateway.setDaemonState('missing');

  const listed = await ctx.callTool(ctx.claim, 'coding.sessions', {});

  expect(listed.outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('daemon_missing'),
  });
});

test('#coding.start joins a session on the gateway, and binds it', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.7c1d0e55', name: 'billing refactor' });

  const taskID = await ctx.joinSession();
  const read = await ctx.callTool(ctx.claim, 'coding.read', { task: taskID });

  expect(read.outcome).toMatchObject({ status: 'ok', result: { state: 'running' } });
});

test('#coding.start spawns a session on the gateway under the action key, and binds it', async () => {
  const ctx = await setupTest();

  await ctx.startTask(ctx.claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();
  await ctx.runSteps();

  const [action] = await readTestActions(ctx.log.writer);

  const spawn = ctx.gateway.calls.find((call) => call.procedure === 'session.spawn');

  expect(spawn?.args['idempotencyKey']).toBe(action?.actionID);
});

test('#coding.read gives a result that matches its output schema, for a session with a pending question, a long reply, a prompt and a tail', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'needs_you',
    pending: 'Which branch should I rebase on?',
    result: 'c'.repeat(3000),
    prompt: 'Refactor the billing module.',
    rows: [
      { role: 'user', text: 'Refactor the billing module.' },
      { role: 'assistant', text: 'Reading.', tools: [{ name: 'Read', input: 'billing.ts' }] },
      { role: 'user', text: 'Go on.' },
      { role: 'assistant', text: 'Which branch?' },
    ],
  });

  const taskID = await ctx.joinSession();

  const read = await ctx.callTool(ctx.claim, 'coding.read', {
    task: taskID,
    prompt: true,
    tail: 2,
  });

  const output = ctx.tools.get('coding.read')?.output;

  invariant(output);
  invariant(read.outcome.status === 'ok');

  expect(buildSchemaParser(output)(read.outcome.result)).toStrictEqual({ isValid: true });

  expect(read.outcome.result).toStrictEqual({
    state: 'waiting',
    question: 'Which branch should I rebase on?',
    lastReply: { text: expect.stringMatching(/^c+$/u), cut: true },
    prompt: { text: 'Refactor the billing module.', cut: false },
    tail: {
      turns: [
        {
          user: 'Refactor the billing module.',
          assistant: 'Reading.',
          tools: ['Read: billing.ts'],
        },
        { user: 'Go on.', assistant: 'Which branch?', tools: [] },
      ],
      cut: false,
    },
  });
});

test('#coding.read gives a result that matches its output schema, for a multi-line reply, tool-use turns and a tail that needs a cut', async () => {
  const ctx = await setupTest();

  const reply = [
    'I moved the invoice rounding into `roundInvoice` and updated the callers.',
    '',
    '```ts',
    'export function roundInvoice(cents: number): number {',
    '  return Math.round(cents / 5) * 5;',
    '}',
    '```',
    '',
    'The suite passes: 212 tests, 0 failures. Café totals now round the same way.',
  ].join('\n');

  const longExplanation = `${'The refund path still rounds per line. '.repeat(260)}Done.`;

  ctx.gateway.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'invoice rounding',
    state: 'done',
    result: reply,
    prompt: 'Round invoice totals to 5 cents.\n\nKeep the refund path as it is.',
    rows: [
      { role: 'user', text: 'Round invoice totals to 5 cents.\n\nKeep the refund path as it is.' },
      {
        role: 'assistant',
        text: 'Reading the billing module first.',
        tools: [
          { name: 'Read', input: 'src/billing/invoice.ts' },
          { name: 'Bash', input: 'bun test src/billing\n--bail' },
        ],
      },
      { role: 'user', text: 'Why is the refund path different?' },
      { role: 'assistant', text: longExplanation, tools: [{ name: 'Grep', input: 'refund' }] },
      { role: 'user', text: 'Run the suite once more.' },
      {
        role: 'assistant',
        text: reply,
        tools: [{ name: 'Edit', input: 'src/billing/invoice.ts' }],
      },
    ],
  });

  const taskID = await ctx.joinSession();

  const read = await ctx.callTool(ctx.claim, 'coding.read', {
    task: taskID,
    prompt: true,
    tail: 3,
  });

  const output = ctx.tools.get('coding.read')?.output;

  invariant(output);
  invariant(read.outcome.status === 'ok');

  expect(buildSchemaParser(output)(read.outcome.result)).toStrictEqual({ isValid: true });

  expect(read.outcome.result).toMatchObject({
    state: 'idle',
    question: null,
    lastReply: { text: reply, cut: false },
    prompt: {
      text: 'Round invoice totals to 5 cents.\n\nKeep the refund path as it is.',
      cut: false,
    },
    tail: { cut: true },
  });
});

test('#coding.read reads a session with no tail argument', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    state: 'needs_you',
    pending: 'Which branch?',
  });

  const taskID = await ctx.joinSession();
  const read = await ctx.callTool(ctx.claim, 'coding.read', { task: taskID });

  const output = ctx.tools.get('coding.read')?.output;

  invariant(output);
  invariant(read.outcome.status === 'ok');

  expect(buildSchemaParser(output)(read.outcome.result)).toStrictEqual({ isValid: true });
});

test('#coding.steer types the text through the gateway as one input', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.7c1d0e55' });

  const taskID = await ctx.joinSession();

  await ctx.callTool(ctx.claim, 'coding.steer', { task: taskID, text: 'Find why it expires.' });
  await ctx.runActions();

  const typed = ctx.gateway.calls.filter((call) => call.procedure === 'session.submit');

  expect(typed.map((call) => call.args['text'])).toStrictEqual(['Find why it expires.']);
});

test('#coding.message sends the note through the gateway under the action key', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.7c1d0e55' });

  const taskID = await ctx.joinSession();

  await ctx.callTool(ctx.claim, 'coding.message', {
    task: taskID,
    text: 'Use the shared fixture.',
  });

  await ctx.runActions();

  const [action] = await readTestActions(ctx.log.writer);

  const sent = ctx.gateway.calls.filter((call) => call.procedure === 'session.message');

  expect(sent.map((call) => [call.args['text'], call.args['idempotencyKey']])).toStrictEqual([
    ['Use the shared fixture.', action?.actionID],
  ]);
});

test('#coding.watch writes the wake set of a task that joined a session on the gateway', async () => {
  const ctx = await setupTest();

  ctx.gateway.addSession({ id: 'cloud.3f9a1c2e.7c1d0e55' });

  const taskID = await ctx.joinSession();

  const watched = await ctx.callTool(ctx.claim, 'coding.watch', {
    task: taskID,
    wake: ['progress'],
  });

  expect(watched.outcome).toStrictEqual({ status: 'ok', result: { wake: ['progress'] } });
});

test('#coding.stop kills the session on the gateway when the task stops', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.startTask(ctx.claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();
  await ctx.runSteps();

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  await ctx.runSteps();
  await ctx.runActions();

  const killed = ctx.gateway.calls.filter((call) => call.procedure === 'session.kill');

  expect(killed).toHaveLength(1);
});
