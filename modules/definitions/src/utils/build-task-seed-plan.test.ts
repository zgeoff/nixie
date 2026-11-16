import { expect, test } from 'bun:test';
import { buildTestRuntimeTaskChange } from '../test-utils/build-test-runtime-task-change';
import { buildTaskSeedPlan } from './build-task-seed-plan';

test('it adopts a change whose hash the repo holds', () => {
  const change = buildTestRuntimeTaskChange({});

  const plan = buildTaskSeedPlan({
    repo: [{ id: 'water-the-tomatoes', hash: 'h-nixie' }],
    runtime: [change],
    readable: new Set(['h-nixie']),
  });

  expect(plan).toStrictEqual({
    definitions: [
      {
        definitionID: 'water-the-tomatoes',
        hash: 'h-nixie',
        origin: 'definitions',
        changeID: null,
        isUnreadable: false,
      },
    ],
    tasks: [{ id: 'water-the-tomatoes', hash: 'h-nixie', origin: 'definitions' }],
    adopted: [change],
    moved: [],
    stays: [],
  });
});

test('it adopts an undefine when the repo holds no such definition', () => {
  const change = buildTestRuntimeTaskChange({ hash: null, base: null, definitions: null });
  const plan = buildTaskSeedPlan({ repo: [], runtime: [change], readable: new Set() });

  expect(plan).toStrictEqual({
    definitions: [],
    tasks: [],
    adopted: [change],
    moved: [],
    stays: [],
  });
});

test('it keeps a change in force while the repo holds its base', () => {
  const change = buildTestRuntimeTaskChange({});

  const plan = buildTaskSeedPlan({
    repo: [{ id: 'water-the-tomatoes', hash: 'h-repo' }],
    runtime: [change],
    readable: new Set(['h-nixie']),
  });

  expect(plan).toStrictEqual({
    definitions: [
      {
        definitionID: 'water-the-tomatoes',
        hash: 'h-nixie',
        origin: 'nixie',
        changeID: 'c1',
        isUnreadable: false,
      },
    ],
    tasks: [{ id: 'water-the-tomatoes', hash: 'h-nixie', origin: 'nixie', changeID: 'c1' }],
    adopted: [],
    moved: [],
    stays: [change],
  });
});

test('it reports the repo version that differs from the base', () => {
  const change = buildTestRuntimeTaskChange({});

  const plan = buildTaskSeedPlan({
    repo: [{ id: 'water-the-tomatoes', hash: 'h-other' }],
    runtime: [change],
    readable: new Set(['h-nixie']),
  });

  expect(plan.moved).toStrictEqual([{ change, definitions: 'h-other' }]);
});

test('it reports no second move for a repo version the change already holds', () => {
  const change = buildTestRuntimeTaskChange({ definitions: 'h-other' });

  const plan = buildTaskSeedPlan({
    repo: [{ id: 'water-the-tomatoes', hash: 'h-other' }],
    runtime: [change],
    readable: new Set(['h-nixie']),
  });

  expect(plan.moved).toStrictEqual([]);
  expect(plan.stays).toStrictEqual([change]);
});

test('it removes a repo definition that an undefine holds', () => {
  const change = buildTestRuntimeTaskChange({ hash: null });

  const plan = buildTaskSeedPlan({
    repo: [
      { id: 'water-the-tomatoes', hash: 'h-repo' },
      { id: 'feed-the-cat', hash: 'h-cat' },
    ],
    runtime: [change],
    readable: new Set(),
  });

  expect(plan.tasks).toStrictEqual([{ id: 'feed-the-cat', hash: 'h-cat', origin: 'definitions' }]);
});

test('it leaves out a definition whose version cannot be read', () => {
  const change = buildTestRuntimeTaskChange({});

  const plan = buildTaskSeedPlan({
    repo: [{ id: 'water-the-tomatoes', hash: 'h-repo' }],
    runtime: [change],
    readable: new Set(),
  });

  expect(plan.tasks).toStrictEqual([]);

  expect(plan.definitions).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      hash: 'h-nixie',
      origin: 'nixie',
      changeID: 'c1',
      isUnreadable: true,
    },
  ]);

  expect(plan.stays).toStrictEqual([change]);
});

test('it adds a definition that only the runtime layer holds', () => {
  const plan = buildTaskSeedPlan({
    repo: [{ id: 'feed-the-cat', hash: 'h-cat' }],
    runtime: [buildTestRuntimeTaskChange({ base: null, definitions: null })],
    readable: new Set(['h-nixie']),
  });

  expect(plan.tasks).toStrictEqual([
    { id: 'feed-the-cat', hash: 'h-cat', origin: 'definitions' },
    { id: 'water-the-tomatoes', hash: 'h-nixie', origin: 'nixie', changeID: 'c1' },
  ]);
});
