import { expect, test } from 'bun:test';
import { buildValueForms } from '@heynixie/egress';
import { eventBufferCapBytes, scrubEventStream } from './scrub-event-stream';

function setupTest() {
  const encoder = new TextEncoder();

  return {
    scrub: (chunks: readonly Uint8Array[]) => {
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }

          controller.close();
        },
      });

      return new Response(scrubEventStream(body, buildValueForms('fake-secret-1'))).text();
    },
    buildEvent: (byteLength: number) => encoder.encode(`${'a'.repeat(byteLength - 2)}\n\n`),
  };
}

test('it refuses a complete event over the cap that arrives in one chunk', async () => {
  const ctx = setupTest();
  const scrubbing = ctx.scrub([ctx.buildEvent(eventBufferCapBytes + 8)]);

  await Promise.allSettled([scrubbing]);

  expect(scrubbing).rejects.toThrow('larger than the fetcher holds');
});

test('it refuses the same event over the cap when it arrives in many chunks', async () => {
  const ctx = setupTest();
  const event = ctx.buildEvent(eventBufferCapBytes + 8);
  const scrubbing = ctx.scrub([event.subarray(0, 1000), event.subarray(1000)]);

  await Promise.allSettled([scrubbing]);

  expect(scrubbing).rejects.toThrow('larger than the fetcher holds');
});

test('it passes an event of exactly the cap', async () => {
  const ctx = setupTest();
  const event = ctx.buildEvent(eventBufferCapBytes);

  const text = await ctx.scrub([event]);

  expect(text.length).toBe(eventBufferCapBytes);
});

test('it passes several small events that together pass the cap', async () => {
  const ctx = setupTest();
  const event = ctx.buildEvent(eventBufferCapBytes / 2 - 10);

  const text = await ctx.scrub([Buffer.concat([event, event, event])]);

  expect(text.length).toBe(3 * (eventBufferCapBytes / 2 - 10));
});
