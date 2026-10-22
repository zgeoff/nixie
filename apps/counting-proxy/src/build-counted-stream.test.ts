import { expect, mock, test } from 'bun:test';
import { buildCountedStream } from './build-counted-stream';

test('it passes every byte through and reports the usage of the message start and the last delta', async () => {
  const onEnd = mock(async () => {});

  const text = [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":40,',
    '"output_tokens":1,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2000}}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":12,"cache_read_input_tokens":null}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];

  const body = new Response(
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (const part of text) {
          controller.enqueue(new TextEncoder().encode(part));
        }

        controller.close();
      },
    }),
  ).body;

  if (body === null) {
    throw new Error('the test response has no body');
  }

  const passed = await new Response(buildCountedStream(body, onEnd)).text();

  expect(passed).toBe(text.join(''));

  expect(onEnd).toHaveBeenCalledExactlyOnceWith({
    input_tokens: 40,
    output_tokens: 12,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2000 },
  });
});

test('it reports the usage seen so far when the reader stops early', async () => {
  const onEnd = mock(async () => {});

  const upstream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(
        new TextEncoder().encode(
          'data: {"type":"message_start","message":{"usage":{"input_tokens":40,"output_tokens":1}}}\n\n',
        ),
      );
    },
  });

  const reader = buildCountedStream(upstream, onEnd).getReader();

  await reader.read();
  await reader.cancel();

  expect(onEnd).toHaveBeenCalledExactlyOnceWith({
    input_tokens: 40,
    output_tokens: 1,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
  });
});

test('it reports the usage seen so far and fails the stream when the upstream breaks', async () => {
  const onEnd = mock(async () => {});
  const started = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();

  const upstream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(
        new TextEncoder().encode(
          'data: {"type":"message_start","message":{"usage":{"input_tokens":40,"output_tokens":1}}}\n\n',
        ),
      );

      started.resolve(controller);
    },
  });

  const reader = buildCountedStream(upstream, onEnd).getReader();

  await reader.read();

  const controller = await started.promise;

  controller.error(new Error('the upstream dropped the connection'));

  expect(reader.read()).rejects.toThrow('the upstream dropped the connection');

  expect(onEnd).toHaveBeenCalledExactlyOnceWith({
    input_tokens: 40,
    output_tokens: 1,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
  });
});

test('it reports no usage for a stream with no usage event', async () => {
  const onEnd = mock(async () => {});

  const upstream = new Response('event: ping\ndata: {"type":"ping"}\n\n').body;

  if (upstream === null) {
    throw new Error('the test response has no body');
  }

  await new Response(buildCountedStream(upstream, onEnd)).text();

  expect(onEnd).toHaveBeenCalledExactlyOnceWith(null);
});
