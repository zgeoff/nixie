import { expect, test } from 'bun:test';
import {
  createConsolidationDiff,
  createMemoryItem,
  startTestMemory,
} from '@heynixie/memory/test-utils';
import { createRouterClient } from '@orpc/server';
import invariant from 'tiny-invariant';
import { createHostConsolidationProcedures } from './create-host-consolidation-procedures';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    memory,
    client: createRouterClient(createHostConsolidationProcedures(() => memory.store)),
  };
}

test('#read shows the pending diff with each input at the version its change read, and the hash an answer binds to', async () => {
  const ctx = await setupTest();
  const kept = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });

  const dropped = await createMemoryItem(ctx.memory.store, {
    text: 'Has a peanut allergy',
    origin: 'task',
    source: 'untrusted',
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, dropped],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
        source: 'untrusted',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  const shown = await ctx.client.read();

  expect(shown).toStrictEqual({
    diffID: diff.diffID,
    model: 'claude-test-1',
    createdAt: new Date(diff.createdAt),
    changes: [
      {
        changeID: change.changeID,
        shortID: change.shortID,
        kind: 'merge',
        inputs: [
          { ...kept, text: 'Is allergic to peanuts', isCurrent: true },
          { ...dropped, text: 'Has a peanut allergy', isCurrent: true },
        ],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
        source: 'untrusted',
        actionHash: change.actionHash,
        lapseAt: new Date(change.lapseAt),
        comment: null,
      },
    ],
    summary: null,
  });
});

test('#read shows the comment the conversation left beside its change, and none beside the other', async () => {
  const ctx = await setupTest();

  const [joke, stale] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Calls the cat the night manager' }),
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [joke],
        text: 'Has a cat',
        reason: 'The wording is informal.',
        source: 'owner',
      },
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
    ],
  });

  const [rewrite, retirement] = diff.changes;

  invariant(rewrite && retirement);

  await ctx.memory.store.consolidations.comment({
    changeID: rewrite.shortID,
    text: 'The rewrite drops the joke: the cat is the night manager.',
    runID: 'run-1',
  });

  const shown = await ctx.client.read();

  expect(shown).toMatchObject({
    changes: [
      {
        changeID: rewrite.changeID,
        comment: {
          text: 'The rewrite drops the joke: the cat is the night manager.',
          at: expect.toBeValidDate(),
        },
      },
      { changeID: retirement.changeID, comment: null },
    ],
  });
});

test('#read answers null when no diff waits', async () => {
  const ctx = await setupTest();
  const shown = await ctx.client.read();

  expect(shown).toBeNull();
});

test('#approve answers with the outcome of each change it approved', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  const approved = await ctx.client.approve({
    answers: [{ changeID: change.changeID, actionHash: change.actionHash }],
  });

  expect(approved).toStrictEqual({
    outcomes: [
      { changeID: change.changeID, status: 'applied', versions: [{ ...stale, version: 2 }] },
    ],
  });
});

test('#approve refuses an approval with no answers as a bad request', async () => {
  const ctx = await setupTest();

  const approved = ctx.client.approve({ answers: [] });

  await approved.catch(() => {});

  expect(approved).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
});

test('#reject answers with the change it rejected', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  const rejected = await ctx.client.reject({
    changeID: change.changeID,
    actionHash: change.actionHash,
  });

  expect(rejected).toStrictEqual({ changeID: change.changeID });
});

test('#reject refuses a rejection under another action hash with PROPOSAL_HASH', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' }],
  });

  const [change] = diff.changes;

  invariant(change);

  const rejected = ctx.client.reject({ changeID: change.changeID, actionHash: 'sha256:another' });

  await rejected.catch(() => {});

  expect(rejected).rejects.toMatchObject({ code: 'PROPOSAL_HASH', status: 409 });
});
