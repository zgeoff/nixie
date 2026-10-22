import { expect, mock, test } from 'bun:test';
import type { CheckReply, CheckRequest } from '@heynixie/wire';
import { checkReplySchema, decodeTurnFrame } from '@heynixie/wire';
import { startStubCheck } from './start-stub-check';

test('it answers the check request it receives with one reply, then exits with code 0', async () => {
  const answer = mock<(request: CheckRequest) => CheckReply>(() => ({
    kind: 'answer',
    output: { verdict: 'asserted' },
    costUSD: 0,
    durationMs: 0,
    apiMs: 0,
  }));

  const stream = startStubCheck(answer);

  const request: CheckRequest = {
    profile: {
      model: 'claude-test-1',
      baseURL: 'http://127.0.0.1:9',
      effort: 'low',
      authHeader: 'x-api-key',
    },
    systemPrompt: 'You check one candidate memory.',
    input: '<owner_message>\nI walk the dog at seven\n</owner_message>',
  };

  await stream.send(new TextEncoder().encode(JSON.stringify(request)));

  const messages = await Array.fromAsync(stream.messages);
  const exited = await stream.exit;

  expect(answer).toHaveBeenCalledExactlyOnceWith(request);

  expect(messages.map((message) => decodeTurnFrame(checkReplySchema, message))).toStrictEqual([
    { kind: 'answer', output: { verdict: 'asserted' }, costUSD: 0, durationMs: 0, apiMs: 0 },
  ]);

  expect(exited).toMatchObject({ code: 0, signal: null });
});

test('it settles a stop after a request whose reply nobody reads', async () => {
  const stream = startStubCheck(() => ({ kind: 'failed', reason: 'the check found no quote' }));

  const request: CheckRequest = {
    profile: {
      model: 'claude-test-1',
      baseURL: 'http://127.0.0.1:9',
      effort: 'low',
      authHeader: 'x-api-key',
    },
    systemPrompt: 'You check one candidate memory.',
    input: '<owner_message>\nI feed the cat at noon\n</owner_message>',
  };

  await stream.send(new TextEncoder().encode(JSON.stringify(request)));

  const exited = await stream.stop();

  expect(exited).toMatchObject({ code: 0, signal: null });
});

test('it ends with no reply on a stop before a request', async () => {
  const stream = startStubCheck(() => ({ kind: 'failed', reason: 'unused' }));

  const exited = await stream.stop();
  const messages = await Array.fromAsync(stream.messages);

  expect(exited).toMatchObject({ code: null, signal: 'SIGTERM' });
  expect(messages).toStrictEqual([]);
});
