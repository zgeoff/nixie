import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import type { PromptOverrides } from '@heynixie/prompts';
import type { StepInput } from '@heynixie/tasks';
import { claimTask, tasksProjections, writeStepCommit } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import type { ConsolidationConfigInput } from './consolidation-config-schema';
import { consolidationConfigSchema } from './consolidation-config-schema';
import { startMemoryConsolidator } from './start-memory-consolidator';
import { createMemoryItem } from './test-utils/create-memory-item';
import type { StubConsolidatorSession } from './test-utils/create-stub-consolidator-session';
import { createStubConsolidatorSession } from './test-utils/create-stub-consolidator-session';
import { startTestMemory } from './test-utils/start-test-memory';

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

    runStep: async (
      session: StubConsolidatorSession,
      config: ConsolidationConfigInput = {},
      prompts: PromptOverrides = {},
      inbox: StepInput['inbox'] = [],
    ) => {
      const consolidator = await startMemoryConsolidator({
        context,
        store: memory.store,
        staging: session.staging,
        model: session.model,
        config: consolidationConfigSchema.parse(config),
        getPersona: () => 'You are Nix, a warm and brief assistant.',
        getPrompts: () => prompts,
        ownerName: null,
        defaultZone: 'UTC',
        messaging: { directory: [], hopLimit: 20, ownerName: null },
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
        inbox,
        wake: { hop: 0, cause: { kind: 'event' } },
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
    createStubConsolidatorSession([
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

test('it shows a waiting task message to its next session and reads it there', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });
  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });

  const message = buildMockLogRecord({
    sequence: 900,
    kind: 'task_message',
    thread: 'memory-consolidator',
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'memory-consolidator',
      kind: 'request',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: false,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Merge the two choir notes.' } },
  });

  const session = createStubConsolidatorSession([]);

  const result = await ctx.runStep(session, {}, {}, [message]);

  expect(session.model.runSession).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.stringMatching(
        /\n\nMessages to you from other tasks:\n\n<task-message id="k3vq8m2xpa" [^>]+>\nThis message is from another task, not from the owner\.\nMerge the two choir notes\.\n<\/task-message block="\w+">$/u,
      ),
    }),
  );

  expect(result.acknowledged).toStrictEqual([900]);
});

test('it leaves a task message unread when its run opens no session', async () => {
  const ctx = await setupTest();

  const message = buildMockLogRecord({
    sequence: 900,
    kind: 'task_message',
    thread: 'memory-consolidator',
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'memory-consolidator',
      kind: 'request',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: false,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Merge the two choir notes.' } },
  });

  const session = createStubConsolidatorSession([]);

  const result = await ctx.runStep(session, {}, {}, [message]);

  expect(session.model.runSession).not.toHaveBeenCalled();
  expect(result.acknowledged).toStrictEqual([]);
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

  const session = createStubConsolidatorSession([]);

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
    stepRunID: 'memory-consolidator:1@1',
  });
});

test('it shows the session the consolidator prompt override in force', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });
  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });

  const session = createStubConsolidatorSession([]);

  await ctx.runStep(
    session,
    {},
    { consolidator: { parts: {}, template: 'Propose at most {{ memory.maxChanges }} changes.' } },
  );

  expect(session.model.runSession).toHaveBeenCalledWith(
    expect.objectContaining({ systemPrompt: 'Propose at most 30 changes.' }),
  );
});

test('it keeps the summary of a conflict it left alone, sealed under the key of every item the session was shown', async () => {
  const ctx = await setupTest();

  const [oat, black, bees] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
    createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' }),
  ]);

  const result = await ctx.runStep(
    createStubConsolidatorSession(
      [],
      'Two items conflict and stay unchanged: one says oat milk, the other says black.',
    ),
  );

  const diff = await ctx.memory.store.consolidations.readPending();

  expect(result.records.map((record) => record.kind)).toStrictEqual([
    'memory.consolidation_proposed',
    'memory.consolidation_summarized',
  ]);

  expect(JSON.stringify(result.records)).not.toInclude('oat milk');

  expect(diff).toMatchObject({
    changes: [],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: expect.toIncludeSameMembers([oat.itemID, black.itemID, bees.itemID]),
    },
  });
});

test('it shows no diff once a forget erases the summary of a run that proposed no change', async () => {
  const ctx = await setupTest();

  const [oat] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  await ctx.runStep(
    createStubConsolidatorSession([], 'Two items about coffee conflict and stay unchanged.'),
  );

  await ctx.memory.store.forget({
    target: oat,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const diff = await ctx.memory.store.consolidations.readPending();

  expect(diff).toBeNull();
});

test('it lets the summary of a run that proposed no change lapse at the lapse time', async () => {
  const ctx = await setupTest();

  await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  await ctx.runStep(
    createStubConsolidatorSession([], 'Two items about coffee conflict and stay unchanged.'),
  );

  ctx.clock.advance(7 * 24 * 60 * 60 * 1000);

  const diff = await ctx.memory.store.consolidations.readPending();

  expect(diff).toBeNull();
});

test('it records a run with no session when fewer than 2 items are active', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  const session = createStubConsolidatorSession([]);

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

test('it records a run with no session when the complete list holds no item', async () => {
  const ctx = await setupTest();

  const session = createStubConsolidatorSession([]);

  const result = await ctx.runStep(session);

  expect(session.model.runSession).not.toHaveBeenCalled();

  expect(result.records).toMatchObject([
    {
      kind: 'memory.consolidation_proposed',
      payload: { model: null, shownItems: 0, changes: [] },
    },
  ]);
});

test('it runs the session on a list cut at the budget, even when the cut list holds 1 item', async () => {
  const ctx = await setupTest();
  const bees = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });
  await createMemoryItem(ctx.memory.store, { text: 'Grows tomatoes on the balcony' });

  const shortIDs = await ctx.memory.store.readShortIDs([bees.itemID]);

  const session = createStubConsolidatorSession([]);

  await ctx.runStep(session, { item_list_tokens: 40 });

  expect(session.model.runSession).toHaveBeenCalledExactlyOnceWith({
    systemPrompt: expect.toStartWith('You are Nix, a warm and brief assistant.'),
    prompt: expect.toSatisfy((prompt: string) =>
      new RegExp(
        `^Current memory items \\(not the complete list; find others with memory\\.recall\\):\\n- ${shortIDs.get(bees.itemID) ?? 'missing'} \\(\\d{4}-\\d{2}-\\d{2}\\): Keeps bees on the roof$`,
        'u',
      ).test(prompt),
    ),
    signal: expect.toSatisfy((signal: unknown) => signal instanceof AbortSignal),
    stepRunID: 'memory-consolidator:1@1',
  });
});

test('it waits a whole period after the last run before it runs again', async () => {
  const ctx = await setupTest();

  const session = createStubConsolidatorSession([]);

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
    createStubConsolidatorSession([
      { kind: 'retire', itemIDs: [trip.itemID], reason: 'The trip has ended.' },
    ]),
  );

  ctx.clock.advance(7 * 24 * 60 * 60 * 1000 - 1);

  const session = createStubConsolidatorSession([]);

  const result = await ctx.runStep(session);

  expect(session.model.runSession).not.toHaveBeenCalled();
  expect(result.timers).toStrictEqual([{ dueAt: Date.parse('2026-10-19T09:00:00Z') }]);
});

test('it lapses the last diff once its lapse time passes, and runs again', async () => {
  const ctx = await setupTest();
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });

  await ctx.runStep(
    createStubConsolidatorSession([
      { kind: 'retire', itemIDs: [trip.itemID], reason: 'The trip has ended.' },
    ]),
  );

  ctx.clock.advance(7 * 24 * 60 * 60 * 1000);

  const session = createStubConsolidatorSession([]);

  const result = await ctx.runStep(session);

  expect(session.model.runSession).toHaveBeenCalledOnce();
  expect(result.timers).toStrictEqual([{ dueAt: Date.parse('2026-10-26T09:00:00Z') }]);
});

test('it waits the retry time after a failed session, and stages nothing', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  await createMemoryItem(ctx.memory.store, { text: 'Sings in a choir' });

  const session = createStubConsolidatorSession([]);

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
