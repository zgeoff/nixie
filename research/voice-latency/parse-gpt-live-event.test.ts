import { expect, test } from 'bun:test';
import { parseGptLiveEvent } from './parse-gpt-live-event.ts';

test('it reads an audio delta as samples', () => {
  const event = parseGptLiveEvent({
    delta: Buffer.from([0x00, 0xc0]).toString('base64'),
    event_id: 'event_1',
    type: 'session.output_audio.delta',
  });

  if (event.kind !== 'audio') {
    throw new Error(`expected audio, got ${event.kind}`);
  }
  expect(Array.from(event.audio)).toStrictEqual([-0.5]);
});

test('it reads a delegation to the client', () => {
  expect(
    parseGptLiveEvent({
      delegation: { id: 'delegation_4', target: 'client' },
      event_id: 'event_2',
      offset_ms: 2800,
      type: 'session.delegation.created',
    }),
  ).toStrictEqual({ delegationID: 'delegation_4', kind: 'delegation' });
});

test('it ignores a delegation to a backend other than the client', () => {
  expect(
    parseGptLiveEvent({
      delegation: { id: 'delegation_5', target: 'responses' },
      event_id: 'event_3',
      type: 'session.delegation.created',
    }),
  ).toStrictEqual({ kind: 'ignored' });
});

test('it reads what the model heard the caller say', () => {
  expect(
    parseGptLiveEvent({ delta: ' camping', end_ms: 2200, event_id: 'event_4', start_ms: 2000, type: 'session.input_transcript.delta' }),
  ).toStrictEqual({ kind: 'heard', text: ' camping' });
});

test('it reads what the model said', () => {
  expect(
    parseGptLiveEvent({ delta: ' Pack a', end_ms: 2800, event_id: 'event_5', start_ms: 2600, type: 'session.output_transcript.delta' }),
  ).toStrictEqual({ kind: 'said', text: ' Pack a' });
});

test('it reads the started session as ready', () => {
  expect(
    parseGptLiveEvent({ event_id: 'event_6', session: { id: 'live_1', model: 'gpt-live-1' }, type: 'session.started' }),
  ).toStrictEqual({ kind: 'ready' });
});

test('it reads an error with its message', () => {
  expect(
    parseGptLiveEvent({ error: { code: 'invalid_value', message: 'unknown voice' }, event_id: 'event_7', type: 'error' }),
  ).toStrictEqual({ kind: 'error', message: 'unknown voice' });
});

test('it ignores an event the runner does not act on', () => {
  expect(
    parseGptLiveEvent({ event_id: 'event_8', type: 'session.usage.updated', usage: { seconds: 14 } }),
  ).toStrictEqual({ kind: 'ignored' });
});
