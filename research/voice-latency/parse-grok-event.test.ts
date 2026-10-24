import { expect, test } from 'bun:test';
import { parseGrokEvent } from './parse-grok-event.ts';

test('it reads an audio delta as samples', () => {
  const event = parseGrokEvent({
    content_index: 0,
    delta: Buffer.from([0x00, 0x40]).toString('base64'),
    event_id: 'event-1',
    item_id: 'item-1',
    output_index: 0,
    response_id: 'response-1',
    type: 'response.output_audio.delta',
  });

  if (event.kind !== 'audio') {
    throw new Error(`expected audio, got ${event.kind}`);
  }
  expect(Array.from(event.audio)).toStrictEqual([0.5]);
});

test('it reads a finished function call', () => {
  expect(
    parseGrokEvent({
      arguments: '{"city":"Lyon","day":"tomorrow"}',
      call_id: 'call-7',
      event_id: 'event-2',
      name: 'read_weather',
      type: 'response.function_call_arguments.done',
    }),
  ).toStrictEqual({
    arguments: '{"city":"Lyon","day":"tomorrow"}',
    callID: 'call-7',
    kind: 'tool-call',
    name: 'read_weather',
  });
});

test('it marks a finished response that holds a function call', () => {
  expect(
    parseGrokEvent({
      event_id: 'event-3',
      response: { id: 'response-1', output: [{ id: 'item-2', type: 'function_call' }], status: 'completed' },
      type: 'response.done',
    }),
  ).toStrictEqual({ hasToolCall: true, kind: 'response-done' });
});

test('it marks a finished response that holds only speech', () => {
  expect(
    parseGrokEvent({
      event_id: 'event-4',
      response: { id: 'response-2', output: [{ id: 'item-3', role: 'assistant', type: 'message' }] },
      type: 'response.done',
    }),
  ).toStrictEqual({ hasToolCall: false, kind: 'response-done' });
});

test('it reads the session update as ready', () => {
  expect(parseGrokEvent({ session: { model: 'grok-voice-3.0' }, type: 'session.updated' })).toStrictEqual({
    kind: 'ready',
  });
});

test('it reads the finished transcript of the reply', () => {
  expect(
    parseGrokEvent({
      event_id: 'event-5',
      item_id: 'item-3',
      transcript: 'Pack layers and a rain jacket.',
      type: 'response.output_audio_transcript.done',
    }),
  ).toStrictEqual({ kind: 'said', text: 'Pack layers and a rain jacket.' });
});

test('it reads that the caller started to speak', () => {
  expect(
    parseGrokEvent({
      audio_start_ms: 249,
      event_id: 'event-3',
      item_id: 'item-1',
      previous_item_id: null,
      type: 'input_audio_buffer.speech_started',
    }),
  ).toStrictEqual({ kind: 'caller-started' });
});

test('it reads what the model heard the caller say', () => {
  expect(
    parseGrokEvent({
      content_index: 0,
      event_id: 'event-7',
      item_id: 'item-1',
      status: 'completed',
      transcript: 'What should I pack for a weekend of camping by a lake?',
      type: 'conversation.item.input_audio_transcription.completed',
    }),
  ).toStrictEqual({ kind: 'heard', text: 'What should I pack for a weekend of camping by a lake?' });
});

test('it reads an error with its message', () => {
  expect(
    parseGrokEvent({ error: { message: 'invalid session config', type: 'invalid_request_error' }, type: 'error' }),
  ).toStrictEqual({ kind: 'error', message: 'invalid session config' });
});

test('it ignores an event the runner does not act on', () => {
  expect(parseGrokEvent({ event_id: 'event-6', timestamp: 1, type: 'ping' })).toStrictEqual({ kind: 'ignored' });
});
