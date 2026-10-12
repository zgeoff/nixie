import { expect, test } from 'bun:test';
import { collectOutput } from './collect-output';
import { execOutputLimitBytes } from './exec-output-limit-bytes';

test('it cuts output past 1 MiB and counts every byte', async () => {
  const chunk = new Uint8Array(700 * 1024).fill(7);

  const collected = await collectOutput(
    new Blob([chunk, chunk, chunk]).stream(),
    execOutputLimitBytes,
  );

  expect(execOutputLimitBytes).toBe(1_048_576);
  expect(collected.bytes.byteLength).toBe(1_048_576);
  expect(collected.totalBytes).toBe(3 * 700 * 1024);
  expect(collected.isCut).toBeTrue();
});

test('it keeps output under the limit whole', async () => {
  const collected = await collectOutput(new Blob(['he', 'llo']).stream(), execOutputLimitBytes);

  expect(collected).toStrictEqual({
    bytes: new TextEncoder().encode('hello'),
    totalBytes: 5,
    isCut: false,
  });
});
