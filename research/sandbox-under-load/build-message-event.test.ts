import { expect, test } from 'bun:test';
import { buildMessageEvent } from './build-message-event';

test('it logs an API retry with its attempt, delay, status and error', () => {
  expect(
    buildMessageEvent({
      type: 'system',
      subtype: 'api_retry',
      attempt: 1,
      max_retries: 10,
      retry_delay_ms: 512,
      error_status: 401,
      error: 'authentication_failed',
      uuid: '6f1c2e8a-4b3d-4e5f-9a7b-1c2d3e4f5a6b',
      session_id: 'session-invented-1',
    }),
  ).toStrictEqual({
    event: 'api_retry',
    fields: {
      attempt: 1,
      maxRetries: 10,
      retryDelayMs: 512,
      status: 401,
      error: 'authentication_failed',
    },
  });
});

test('it logs the stop of a streamed response', () => {
  expect(
    buildMessageEvent({
      type: 'stream_event',
      event: { type: 'message_stop' },
      parent_tool_use_id: null,
      uuid: '6f1c2e8a-4b3d-4e5f-9a7b-1c2d3e4f5a6c',
      session_id: 'session-invented-1',
    }),
  ).toStrictEqual({ event: 'message_stop', fields: {} });
});

test('it skips a stream event inside a response', () => {
  expect(
    buildMessageEvent({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
      parent_tool_use_id: null,
      uuid: '6f1c2e8a-4b3d-4e5f-9a7b-1c2d3e4f5a6d',
      session_id: 'session-invented-1',
    }),
  ).toBeNull();
});

test('it logs another system message by its subtype', () => {
  expect(
    buildMessageEvent({
      type: 'system',
      subtype: 'status',
      status: 'compacting',
      uuid: '6f1c2e8a-4b3d-4e5f-9a7b-1c2d3e4f5a6e',
      session_id: 'session-invented-1',
    }),
  ).toStrictEqual({ event: 'system', fields: { subtype: 'status' } });
});
