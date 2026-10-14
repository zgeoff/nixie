import { expect, test } from 'bun:test';
import { claimTask, tasksProjections, writeStepCommit } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { consolidationConfigSchema } from './consolidation-config-schema';
import { startMemoryConsolidator } from './start-memory-consolidator';
import type { StubConsolidatorSession } from './test-utils/build-stub-consolidator-session';
import { buildStubConsolidatorSession } from './test-utils/build-stub-consolidator-session';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

// A test memory on a test clock, with the task projections, and a step runner that starts the
// consolidator on the session the test gives, claims its task, runs one step and commits it.
async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));
  const memory = await startTestMemory({ gate: { clock } });
  const log = { ...memory.log, projections: [...memory.log.projections, ...tasksProjections] };
  const context = { log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) };
  const errors: unknown[] = [];

  return {
    memory,
    clock,
    errors,

    // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the stub session holds bun mocks
    runStep: async (session: StubConsolidatorSession) => {
      const consolidator = await startMemoryConsolidator({
        context,
        store: memory.store,
        staging: session.staging,
        model: session.model,
        config: consolidationConfigSchema.parse({}),
        getPersona: () => 'You are Nix, a warm and brief assistant.',
        onError: (error) => {
          errors.push(error);
        },
      });
      const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 3_600_000 });

      invariant(claim);

      const result = await consolidator.runStep({
        taskID: claim.lease.workID,
        stepKey: claim.stepKey,
        lease: claim.lease,
        inbox: [],
        sessionBoundary: null,
        signal: new AbortController().signal,
      });

      await writeStepCommit(context, claim, result);
      return result;
    },
  };
}

test('it proposes a merge of duplicate items and a retirement of a stale one, each bound to the versions it read', async () => {
  const ctx = await setupTest();
  const allergy = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });
  const first = await createMemoryItem(ctx.memory.store, { text: 'has peanut allergy' });
  const duplicate = await ctx.memory.store.remember({
    text: 'Has a peanut allergy',
    target: first,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const stale = await createMemoryItem(ctx.memory.store, {
    text: 'Has a dentist visit 2026-03-02',
  });

  await ctx.runStep(
    buildStubConsolidatorSession([
      {
        kind: 'merge',
        itemIDs: [allergy.itemID, duplicate.itemID],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
      },
      { kind: 'retire', itemIDs: [stale.itemID], reason: 'The date has passed.' },
    ]),
  );

  const diff = await ctx.memory.store.consolidations.readPending();

  expect(diff?.changes).toMatchObject([
    {
      kind: 'merge',
      inputs: [
        { itemID: allergy.itemID, version: 1, isCurrent: true },
        { itemID: duplicate.itemID, version: 2, isCurrent: true },
      ],
      text: 'Is allergic to peanuts',
      lapseAt: Date.parse('2026-10-19T09:00:00Z'),
    },
    {
      kind: 'retire',
      inputs: [{ itemID: stale.itemID, version: 1, isCurrent: true }],
      text: null,
      lapseAt: Date.parse('2026-10-19T09:00:00Z'),
    },
  ]);
});

test('it shows the session the persona, the rules and every active item, and no retired one', async () => {
  const ctx = await setupTest();
  const bees = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });
  const choir = await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });
  const old = await createMemoryItem(ctx.memory.store, { text: 'Lives on Elm Street' });

  await ctx.memory.store.retire({
    target: old,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortIDs = await ctx.memory.store.readShortIDs([bees.itemID, choir.itemID]);
  const session = buildStubConsolidatorSession([]);

  await ctx.runStep(session);

  expect(session.model.runSession).toHaveBeenCalledExactlyOnceWith({
    systemPrompt: expect.toStartWith('You are Nix, a warm and brief assistant.\n\nYou tidy'),
    prompt: expect.toSatisfy((prompt: string) =>
      new RegExp(
        `^Current memory items \\(the complete list\\):\\n- ${shortIDs.get(bees.itemID) ?? 'missing'} \\(\\d{4}-\\d{2}-\\d{2}\\): Keeps bees on the roof\\n- ${shortIDs.get(choir.itemID) ?? 'missing'} \\(\\d{4}-\\d{2}-\\d{2}\\): Sings in a choir$`,
        'u',
      ).test(prompt),
    ),
    signal: expect.toSatisfy((signal: unknown) => signal instanceof AbortSignal),
  });
});

test('it records a run with no session when fewer than 2 items are active', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  const session = buildStubConsolidatorSession([]);

  const result = await ctx.runStep(session);

  expect(session.model.runSession).not.toHaveBeenCalled();
  expect(result.records).toMatchObject([
    {
      kind: 'memory.consolidation_proposed',
      payload: { model: null, shownItems: 1, changes: [] },
    },
  ]);
  expect(result.timers).toStrictEqual([{ dueAt: Date.parse('2026-10-19T09:00:00Z') }]);
});

test('it waits a whole period after the last run before it runs again', async () => {
  const ctx = await setupTest();
  const session = buildStubConsolidatorSession([]);

  await ctx.runStep(session);
  ctx.clock.advance(24 * 60 * 60 * 1000);

  const result = await ctx.runStep(session);

  expect(result).toStrictEqual({
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: Date.parse('2026-10-19T09:00:00Z') }],
  });
});

test('it holds the next run while a change of the last diff waits, until that change lapses', async () => {
  const ctx = await setupTest();
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });
  await ctx.runStep(
    buildStubConsolidatorSession([
      { kind: 'retire', itemIDs: [trip.itemID], reason: 'The trip has ended.' },
    ]),
  );
  ctx.clock.advance(7 * 24 * 60 * 60 * 1000 - 1);

  const session = buildStubConsolidatorSession([]);

  const result = await ctx.runStep(session);

  expect(session.model.runSession).not.toHaveBeenCalled();
  expect(result.timers).toStrictEqual([{ dueAt: Date.parse('2026-10-19T09:00:00Z') }]);
});

test('it lapses the last diff once its lapse time passes, and runs again', async () => {
  const ctx = await setupTest();
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });
  await ctx.runStep(
    buildStubConsolidatorSession([
      { kind: 'retire', itemIDs: [trip.itemID], reason: 'The trip has ended.' },
    ]),
  );
  ctx.clock.advance(7 * 24 * 60 * 60 * 1000);

  const session = buildStubConsolidatorSession([]);

  const result = await ctx.runStep(session);

  expect(session.model.runSession).toHaveBeenCalledOnce();
  expect(result.timers).toStrictEqual([{ dueAt: Date.parse('2026-10-26T09:00:00Z') }]);
});

test('it waits the retry time after a failed session, and stages nothing', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });

  const session = buildStubConsolidatorSession([]);

  session.model.runSession.mockImplementation(() =>
    Promise.reject(new Error('the provider refused the call')),
  );

  const result = await ctx.runStep(session);

  expect(result).toStrictEqual({
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: Date.parse('2026-10-12T10:00:00Z') }],
  });
  expect(ctx.errors).toStrictEqual([new Error('the provider refused the call')]);
});
