import { expect, test } from 'bun:test';
import { createConsolidationDiff } from './create-consolidation-diff';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it writes the diff on the consolidator thread and returns its pending changes', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Is in Lisbon until May',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip ended.', source: 'owner' }],
  });

  expect(diff).toStrictEqual({
    diffID: expect.toBeString(),
    model: 'claude-test-1',
    createdAt: expect.toBeNumber(),
    changes: [
      {
        changeID: expect.toBeString(),
        shortID: expect.stringMatching(/^[a-z][0-9a-z]{9}$/u),
        kind: 'retire',
        inputs: [{ ...item, text: 'Is in Lisbon until May', isCurrent: true }],
        text: null,
        reason: 'The trip ended.',
        source: 'owner',
        actionHash: expect.toSatisfy((hash: string) => /^sha256:[0-9a-f]{64}$/u.test(hash)),
        lapseAt: expect.toBeNumber(),
        comment: null,
      },
    ],
  });
});

test('it dates the run and lapses each change at the times the request gives', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Is in Lisbon until May',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const now = Date.now();

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip ended.', source: 'owner' }],
    now,
    lapseMs: 60_000,
  });

  expect(diff.changes[0]?.lapseAt).toBe(now + 60_000);
  expect(diff.createdAt).toBe(now);
});
