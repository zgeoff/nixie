import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { claimWriterLease } from './claim-writer-lease';
import { startTestMemory } from './start-test-memory';

test("it claims the memory writer's lease for an hour", async () => {
  const memory = await startTestMemory();
  const lease = await claimWriterLease({ log: memory.log, clock: buildTestClock(1_000_000) });

  expect(lease).toStrictEqual({
    kind: 'task',
    workID: 'memory-writer',
    holder: 'runner-1',
    generation: expect.toBeNumber(),
    epoch: expect.toBeNumber(),
    expiresAt: 4_600_000,
  });
});

test('it throws when another holder already has the lease', async () => {
  const memory = await startTestMemory();

  const clock = buildTestClock(1_000_000);

  await claimWriterLease({ log: memory.log, clock });

  const claim = claimWriterLease({ log: memory.log, clock });

  await claim.catch(() => {});

  expect(claim).rejects.toThrowWithMessage(Error, /another holder/u);
});
