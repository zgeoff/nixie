import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '../../libs/testing/src/wait-for-condition.ts';
import { startGptLiveCall } from './start-gpt-live-call.ts';
import { startStubVoiceServer } from './test-utils/start-stub-voice-server.ts';

test('it hands a delegated request with what the caller said to the backend and sends its answer back', async () => {
  const server = startStubVoiceServer([
    { type: 'session.started' },
    { delta: 'What is on my calendar for Friday?', end_ms: 1800, start_ms: 0, type: 'session.input_transcript.delta' },
    { delegation: { id: 'delegation-1', target: 'client' }, type: 'session.delegation.created' },
  ]);
  onTestFinished(server.stop);
  const runDelegation = mock((_heard: string) => Promise.resolve('You have the dentist at nine thirty.'));
  const call = startGptLiveCall({
    instructions: 'You are a helpful voice assistant.',
    key: 'key-1',
    openSocket: server.openSocket,
    quietMs: 2500,
    runDelegation,
    sampleRate: 16_000,
    soundThreshold: 0.01,
    voice: 'marin',
  });
  onTestFinished(call.close);
  call.ended.catch(() => undefined);

  await waitForCondition(() => server.received.length === 2);

  expect(runDelegation).toHaveBeenCalledWith('What is on my calendar for Friday?');
  expect(server.received.at(-1)).toStrictEqual({
    content: 'You have the dentist at nine thirty.',
    delegation_id: 'delegation-1',
    type: 'session.commentary.append',
  });
});

test('it opens the session with client delegation and the API key', async () => {
  const server = startStubVoiceServer([]);
  onTestFinished(server.stop);
  const call = startGptLiveCall({
    instructions: 'You are a helpful voice assistant.',
    key: 'key-1',
    openSocket: server.openSocket,
    quietMs: 2500,
    runDelegation: () => Promise.resolve(''),
    sampleRate: 16_000,
    soundThreshold: 0.01,
    voice: 'marin',
  });
  onTestFinished(call.close);
  call.ended.catch(() => undefined);

  await waitForCondition(() => server.received.length === 1);

  expect(server.received).toStrictEqual([
    {
      session: {
        audio: { format: { rate: 16_000, type: 'audio/pcm' }, output: { voice: 'marin' } },
        delegation: { type: 'client' },
        instructions: 'You are a helpful voice assistant.',
        model: 'gpt-live-1',
      },
      type: 'session.start',
    },
  ]);
  expect(server.authorizations).toStrictEqual(['Bearer key-1']);
});
