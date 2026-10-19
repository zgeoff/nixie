import { expect, test } from 'bun:test';
import { buildConversationDriver } from './build-conversation-driver';
import { startTestConversation } from './start-test-conversation';
import { startTestServer } from './start-test-server';

async function setupTest() {
  const server = await startTestServer(undefined, { fakeGuest: true });
  const conversation = await startTestConversation(server, { context: server.context });

  return {
    server,
    conversation: buildConversationDriver({
      context: server.context,
      guest: server.guest,
      getRunStep: () => conversation.runner.runStep,
    }),
  };
}

test('it sends your message and returns the turn the guest received', async () => {
  const ctx = await setupTest();
  const turn = await ctx.conversation.send('How many sugars?');

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

  await ctx.conversation.send('Is the kettle on?');

  const turn = await ctx.conversation.send('How many sugars?');

  expect(turn.resume).toStrictEqual({
    sessionID: expect.toBeString(),
    messageID: expect.toBeString(),
  });
});

test('it returns every turn and summary of a step, and a step that sends only a summary', async () => {
  const ctx = await setupTest();

  ctx.server.guest.setContextSize(170_000);

  const first = await ctx.conversation.sendForStep('What does the tide gauge read?');
  const second = await ctx.conversation.sendForStep('And tomorrow?');

  expect(first).toMatchObject({ turns: [{ type: 'turn' }], summaries: [], error: null });
  expect(second).toMatchObject({ turns: [], summaries: [{ type: 'summarize' }], error: null });
});

test('it fails a send whose step sent no turn to the guest', async () => {
  const ctx = await setupTest();

  ctx.server.guest.setContextSize(170_000);

  await ctx.conversation.send('What does the tide gauge read?');

  const failure = await ctx.conversation.send('And tomorrow?').then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ message: expect.toInclude('the step sent no turn') });
});
