import { expect, test } from 'bun:test';
import { collectOutput } from './collect-output';
import { execOutputLimitBytes } from './exec-output-limit-bytes';

function buildStream(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start: (controller) => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

test('it cuts output past 1 MiB and counts every byte', async () => {
  const chunk = new Uint8Array(700 * 1024).fill(7);
  const collected = await collectOutput(buildStream([chunk, chunk, chunk]), execOutputLimitBytes);

  expect(execOutputLimitBytes).toBe(1_048_576);
  expect(collected.bytes.byteLength).toBe(1_048_576);
  expect(collected.totalBytes).toBe(3 * 700 * 1024);
  expect(collected.isCut).toBeTrue();
});

test('it keeps output under the limit whole', async () => {
  const collected = await collectOutput(
    buildStream([new TextEncoder().encode('he'), new TextEncoder().encode('llo')]),
    execOutputLimitBytes,
  );

  expect(new TextDecoder().decode(collected.bytes)).toBe('hello');
  expect(collected).toMatchObject({ totalBytes: 5, isCut: false });
});
