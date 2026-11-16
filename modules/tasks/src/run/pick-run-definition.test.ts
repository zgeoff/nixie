import { expect, test } from 'bun:test';
import { buildTestTaskRun } from '../test-utils/build-test-task-run';
import type { RunDefinitionFacts } from './pick-run-definition';
import { pickRunDefinition } from './pick-run-definition';

function setupTest() {
  const noFacts: RunDefinitionFacts = {
    open: null,
    isLimitHeld: false,
    control: null,
    newest: null,
    fires: [],
    heldKeys: new Set(),
    waking: null,
    hashInForce: 'hash-new',
  };

  const fire = { sequence: 7, dedupeKey: 'key-1', definitionHash: 'hash-old' };

  return { noFacts, fire };
}

test('it opens the task run of an unread fire that pins the fire hash and ignores the hash in force', () => {
  const ctx = setupTest();
  const pick = pickRunDefinition({ ...ctx.noFacts, fires: [ctx.fire] });

  expect(pick).toStrictEqual({
    kind: 'open',
    origin: { kind: 'trigger', sequence: 7 },
    definitionHash: 'hash-old',
    triggerKey: 'key-1',
    carries: null,
    isEndingOpen: false,
  });
});

test('it opens the task run of a fire although the definition is out of force', () => {
  const ctx = setupTest();
  const pick = pickRunDefinition({ ...ctx.noFacts, fires: [ctx.fire], hashInForce: null });

  expect(pick).toMatchObject({ kind: 'open', origin: { kind: 'trigger' } });
});

test('it opens the task run of the newest fire when 2 fires are unread', () => {
  const ctx = setupTest();

  const pick = pickRunDefinition({
    ...ctx.noFacts,
    fires: [ctx.fire, { sequence: 9, dedupeKey: 'key-2', definitionHash: 'hash-new' }],
  });

  expect(pick).toMatchObject({
    kind: 'open',
    origin: { kind: 'trigger', sequence: 9 },
    triggerKey: 'key-2',
  });
});

test('it opens no task run for a fire whose key a task run holds', () => {
  const ctx = setupTest();

  const pick = pickRunDefinition({
    ...ctx.noFacts,
    fires: [ctx.fire],
    heldKeys: new Set(['key-1']),
  });

  expect(pick).toStrictEqual({ kind: 'none' });
});

test.each(['raise', 'restart'] as const)(
  'it opens a carrying task run after a %s of the task run that ended with a limit',
  (kind) => {
    const ctx = setupTest();
    const newest = buildTestTaskRun({ definitionHash: 'hash-old', triggerKey: 'key-1' });

    const pick = pickRunDefinition({
      ...ctx.noFacts,
      newest,
      control: { kind, sequence: 12 },
    });

    expect(pick).toStrictEqual({
      kind: 'open',
      origin: { kind, sequence: 12 },
      definitionHash: 'hash-old',
      triggerKey: 'key-1',
      carries: newest,
      isEndingOpen: false,
    });
  },
);

test('it opens a task run of a fire before a carrying one', () => {
  const ctx = setupTest();
  const newest = buildTestTaskRun({ definitionHash: 'hash-old' });

  const pick = pickRunDefinition({
    ...ctx.noFacts,
    newest,
    control: { kind: 'restart', sequence: 12 },
    fires: [ctx.fire],
  });

  expect(pick).toMatchObject({ kind: 'open', origin: { kind: 'trigger' }, carries: null });
});

test('it opens a task run of a waking message that pins the hash in force', () => {
  const ctx = setupTest();
  const pick = pickRunDefinition({ ...ctx.noFacts, waking: { kind: 'message', sequence: 5 } });

  expect(pick).toStrictEqual({
    kind: 'open',
    origin: { kind: 'message', sequence: 5 },
    definitionHash: 'hash-new',
    triggerKey: null,
    carries: null,
    isEndingOpen: false,
  });
});

test('it opens no task run for a waking message while the definition is out of force', () => {
  const ctx = setupTest();

  const pick = pickRunDefinition({
    ...ctx.noFacts,
    hashInForce: null,
    waking: { kind: 'message', sequence: 5 },
  });

  expect(pick).toStrictEqual({ kind: 'none' });
});

test('it opens no task run with nothing unread', () => {
  const ctx = setupTest();

  expect(pickRunDefinition(ctx.noFacts)).toStrictEqual({ kind: 'none' });
});

test('it holds at the limit before any rule reads a fire, a control or a message', () => {
  const ctx = setupTest();

  const pick = pickRunDefinition({
    ...ctx.noFacts,
    isLimitHeld: true,
    fires: [ctx.fire],
    waking: { kind: 'message', sequence: 5 },
  });

  expect(pick).toStrictEqual({ kind: 'hold' });
});

test.each(['active', 'waiting_reply'] as const)(
  'it joins an open task run that is %s, though a fire waits',
  (phase) => {
    const ctx = setupTest();
    const pick = pickRunDefinition({ ...ctx.noFacts, open: { phase }, fires: [ctx.fire] });

    expect(pick).toStrictEqual({ kind: 'join' });
  },
);

test('it joins an idle task run when no fire waits', () => {
  const ctx = setupTest();
  const pick = pickRunDefinition({ ...ctx.noFacts, open: { phase: 'idle' } });

  expect(pick).toStrictEqual({ kind: 'join' });
});

test('it ends an idle task run to open the task run of a fire with another key', () => {
  const ctx = setupTest();
  const pick = pickRunDefinition({ ...ctx.noFacts, open: { phase: 'idle' }, fires: [ctx.fire] });

  expect(pick).toMatchObject({ kind: 'open', isEndingOpen: true, triggerKey: 'key-1' });
});

test('it joins an idle task run when the only fire waiting has a key a task run holds', () => {
  const ctx = setupTest();

  const pick = pickRunDefinition({
    ...ctx.noFacts,
    open: { phase: 'idle' },
    fires: [ctx.fire],
    heldKeys: new Set(['key-1']),
  });

  expect(pick).toStrictEqual({ kind: 'join' });
});
