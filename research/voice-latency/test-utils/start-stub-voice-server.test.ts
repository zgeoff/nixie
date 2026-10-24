import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '../../../libs/testing/src/wait-for-condition.ts';
import { startStubVoiceServer } from './start-stub-voice-server.ts';

test('it answers the first client message with the script and records what the client sent', async () => {
  const server = startStubVoiceServer([{ type: 'session.started' }, { delta: 'Hello', type: 'session.output_transcript.delta' }]);
  onTestFinished(server.stop);
  const socket = server.openSocket('wss://vendor.test/v1/live', { authorization: 'Bearer key-1' });
  onTestFinished(() => socket.close());
  const heard: unknown[] = [];
  socket.addEventListener('message', (message) => heard.push(JSON.parse(String(message.data))));
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'session.start' })));

  await waitForCondition(() => heard.length === 2);

  expect(heard).toStrictEqual([{ type: 'session.started' }, { delta: 'Hello', type: 'session.output_transcript.delta' }]);
  expect(server.received).toStrictEqual([{ type: 'session.start' }]);
  expect(server.authorizations).toStrictEqual(['Bearer key-1']);
});
