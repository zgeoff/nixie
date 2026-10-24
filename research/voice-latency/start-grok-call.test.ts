import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '../../libs/testing/src/wait-for-condition.ts';
import { startGrokCall } from './start-grok-call.ts';
import { stubTools } from './stub-tool-answers.ts';
import { startStubVoiceServer } from './test-utils/start-stub-voice-server.ts';

test('it answers a tool call with the stub answer and asks for the next response', async () => {
  const server = startStubVoiceServer([
    { type: 'session.updated' },
    { arguments: '{"city":"Lyon"}', call_id: 'call-1', name: 'read_weather', type: 'response.function_call_arguments.done' },
    { response: { output: [{ type: 'function_call' }] }, type: 'response.done' },
  ]);
  onTestFinished(server.stop);
  const call = startGrokCall({
    instructions: 'You are a helpful voice assistant.',
    key: 'key-1',
    openSocket: server.openSocket,
    sampleRate: 16_000,
    voice: 'eve',
  });
  onTestFinished(call.close);
  call.ended.catch(() => undefined);

  await waitForCondition(() => server.received.length === 3);

  expect(server.received.slice(1)).toStrictEqual([
    {
      item: { call_id: 'call-1', output: stubTools.read_weather.answer, type: 'function_call_output' },
      type: 'conversation.item.create',
    },
    { type: 'response.create' },
  ]);
  expect(call.toolCalls).toStrictEqual(['read_weather']);
});

test('it ends the call on a response with no tool call', async () => {
  const server = startStubVoiceServer([
    { type: 'session.updated' },
    { response: { output: [{ type: 'message' }] }, type: 'response.done' },
  ]);
  onTestFinished(server.stop);
  const call = startGrokCall({
    instructions: 'You are a helpful voice assistant.',
    key: 'key-1',
    openSocket: server.openSocket,
    sampleRate: 16_000,
    voice: 'eve',
  });
  onTestFinished(call.close);

  expect(call.ended).resolves.toBeUndefined();
});

test('it records when Grok says the caller started to speak', async () => {
  const server = startStubVoiceServer([
    { type: 'session.updated' },
    { audio_start_ms: 249, item_id: 'item-1', type: 'input_audio_buffer.speech_started' },
  ]);
  onTestFinished(server.stop);
  const call = startGrokCall({
    instructions: 'You are a helpful voice assistant.',
    key: 'key-1',
    openSocket: server.openSocket,
    sampleRate: 16_000,
    voice: 'eve',
  });
  onTestFinished(call.close);
  call.ended.catch(() => undefined);

  await waitForCondition(() => call.stopPlaybackAt.length === 1);

  expect(call.stopPlaybackAt).toStrictEqual([expect.any(Number)]);
});
