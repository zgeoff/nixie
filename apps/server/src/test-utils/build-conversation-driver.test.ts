import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildConversationDriver } from './build-conversation-driver';
import { startTestConversation } from './start-test-conversation';
import { startTestServer } from './start-test-server';

async function setupTest() {
  const server = await startTestServer(undefined, { fakeGuest: true });

  return { server };
}

test('it sends your message and returns the turn the guest received', async () => {
  const ctx = await setupTest();
  const started = await startTestConversation(ctx.server, { context: ctx.server.context });

  const conversation = buildConversationDriver({
    context: ctx.server.context,
    guest: ctx.server.guest,
    getRunStep: () => started.runner.runStep,
  });

  const turn = await conversation.send('How many sugars?');

  expect(turn).toMatchObject({
    type: 'turn',
    resume: null,
    systemPrompt: expect.toInclude('You are nixie.'),
    profile: { model: 'claude-test-1' },
    input: [{ text: expect.toEndWith('How many sugars?') }],
  });
});

test('it returns a turn that resumes the point the last turn ended at', async () => {
  const ctx = await setupTest();
  const started = await startTestConversation(ctx.server, { context: ctx.server.context });

  const conversation = buildConversationDriver({
    context: ctx.server.context,
    guest: ctx.server.guest,
    getRunStep: () => started.runner.runStep,
  });

  await conversation.send('Is the kettle on?');

  const turn = await conversation.send('How many sugars?');

  expect(turn.resume).toStrictEqual({
    sessionID: expect.toBeString(),
    messageID: expect.toBeString(),
  });
});

test('it returns every turn and summary of a step, and a step that sends only a summary', async () => {
  const ctx = await setupTest();
  const started = await startTestConversation(ctx.server, { context: ctx.server.context });

  const conversation = buildConversationDriver({
    context: ctx.server.context,
    guest: ctx.server.guest,
    getRunStep: () => started.runner.runStep,
  });

  ctx.server.guest.setContextSize(170_000);

  const first = await conversation.sendForStep('What does the tide gauge read?');
  const second = await conversation.sendForStep('And tomorrow?');

  expect(first).toMatchObject({ turns: [{ type: 'turn' }], summaries: [], error: null });
  expect(second).toMatchObject({ turns: [], summaries: [{ type: 'summarize' }], error: null });
});

test('it fails a send whose step errored after it sent a turn, with the step error as its cause', async () => {
  const ctx = await setupTest();
  const started = await startTestConversation(ctx.server, { context: ctx.server.context });

  const conversation = buildConversationDriver({
    context: ctx.server.context,
    guest: ctx.server.guest,
    getRunStep: () => started.runner.runStep,
  });

  ctx.server.guest.addReplies({ overflow: 'prompt_too_long' });

  const failure = await conversation.send('What does the tide gauge read?').then(
    () => null,
    (error: unknown) => error,
  );

  invariant(failure instanceof Error);

  expect(ctx.server.guest.turns).toHaveLength(1);

  expect(failure.cause).toMatchObject({
    message: 'the conversation turn passed the context window: prompt_too_long',
  });
});

test('it fails a send whose step sent no turn to the guest', async () => {
  const ctx = await setupTest();
  const started = await startTestConversation(ctx.server, { context: ctx.server.context });

  const conversation = buildConversationDriver({
    context: ctx.server.context,
    guest: ctx.server.guest,
    getRunStep: () => started.runner.runStep,
  });

  ctx.server.guest.setContextSize(170_000);

  await conversation.send('What does the tide gauge read?');

  const failure = await conversation.send('And tomorrow?').then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ message: expect.toInclude('the step sent no turn') });
});
