import { expect, test } from 'bun:test';
import { buildTestDefinitionChange } from '../test-utils/build-test-definition-change';
import { pickDefinitionMove } from './pick-definition-move';

test('#pickDefinitionMove refuses an undo of a change that a later change replaced (row 1)', () => {
  const first = buildTestDefinitionChange({ state: 'superseded', cause: 'later_change' });

  const head = buildTestDefinitionChange({
    changeID: 'c2',
    shortID: 'k2',
    replaces: 'c1',
    hash: 'h-c2',
  });

  const decision = pickDefinitionMove(
    { repo: 'h-r', head, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change: first,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 7,
    },
  );

  expect(decision).toStrictEqual({
    status: 'refused',
    refusal: {
      code: 'REPLACED',
      head: { changeID: 'c2', shortID: 'k2', operation: 'change' },
    },
  });
});

test('#pickDefinitionMove puts the earlier version in force when the change replaced one (row 2)', () => {
  const change = buildTestDefinitionChange({
    changeID: 'c2',
    hash: 'h-c2',
    previous: 'h-c1',
    replaces: 'c1',
  });

  const decision = pickDefinitionMove(
    { repo: 'h-r', head: change, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 7,
    },
  );

  expect(decision).toStrictEqual({
    status: 'move',
    operation: 'undo',
    definitionID: 'water-the-tomatoes',
    hash: 'h-c1',
    previous: 'h-c2',
    base: 'h-r',
    definitions: 'h-r',
    replaces: 'c2',
    undoes: 'c2',
    caller: 'owner',
    restored: null,
  });
});

test('#pickDefinitionMove puts the base in force when the change replaced none and no conflict holds (row 3)', () => {
  const change = buildTestDefinitionChange();

  const decision = pickDefinitionMove(
    { repo: 'h-r', head: change, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 7,
    },
  );

  expect(decision).toStrictEqual({
    status: 'move',
    operation: 'undo',
    definitionID: 'water-the-tomatoes',
    hash: 'h-r',
    previous: 'h-c1',
    base: 'h-r',
    definitions: 'h-r',
    replaces: 'c1',
    undoes: 'c1',
    caller: 'owner',
    restored: null,
  });
});

test('#pickDefinitionMove puts nothing in force when the undone change added the definition (row 3)', () => {
  const change = buildTestDefinitionChange({
    operation: 'add',
    previous: null,
    base: null,
    definitions: null,
  });

  const decision = pickDefinitionMove(
    { repo: null, head: change, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 7,
    },
  );

  expect(decision).toMatchObject({ status: 'move', hash: null, base: null, definitions: null });
});

test('#pickDefinitionMove puts the repo version in force when the repo moved (row 4)', () => {
  const change = buildTestDefinitionChange({ definitions: 'h-r2' });

  const decision = pickDefinitionMove(
    { repo: 'h-r2', head: change, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 7,
    },
  );

  expect(decision).toMatchObject({
    status: 'move',
    hash: 'h-r2',
    base: 'h-r2',
    definitions: 'h-r2',
    restored: 'repo',
  });
});

test('#pickDefinitionMove puts the earlier version in force over a merged change (row 5)', () => {
  const change = buildTestDefinitionChange({ state: 'adopted', cause: 'seed' });

  const decision = pickDefinitionMove(
    { repo: 'h-c1', head: change, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 7,
    },
  );

  expect(decision).toMatchObject({
    status: 'move',
    hash: 'h-r',
    previous: 'h-c1',
    base: 'h-c1',
    definitions: 'h-c1',
    replaces: null,
    restored: null,
  });
});

test('#pickDefinitionMove removes the definition when an undo of a merged add has none to restore (row 5)', () => {
  const change = buildTestDefinitionChange({
    operation: 'add',
    state: 'adopted',
    previous: null,
    base: null,
  });

  const decision = pickDefinitionMove(
    { repo: 'h-c1', head: change, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 7,
    },
  );

  expect(decision).toMatchObject({ status: 'move', hash: null, base: 'h-c1', replaces: null });
});

test('#pickDefinitionMove refuses with the seed record when the repo moved after the merge (row 6)', () => {
  const change = buildTestDefinitionChange({ state: 'adopted', cause: 'seed' });

  const decision = pickDefinitionMove(
    { repo: 'h-r3', head: change, now: 0, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: null,
      seedSequence: 12,
    },
  );

  expect(decision).toStrictEqual({
    status: 'refused',
    refusal: { code: 'REPO_MOVED', seedSequence: 12 },
  });
});

test.each(['one_shot_fired', 'one_shot_skipped', 'kept_repo'] as const)(
  '#pickDefinitionMove refuses an undo of a change retired by %s (row 7)',
  (cause) => {
    const change = buildTestDefinitionChange({ state: 'retired', cause });

    const decision = pickDefinitionMove(
      { repo: 'h-r', head: change, now: 0, isFileOnly: false },
      {
        kind: 'undo',
        change,
        definitionID: 'water-the-tomatoes',
        restoredOneShotAt: null,
        seedSequence: 7,
      },
    );

    expect(decision).toStrictEqual({
      status: 'refused',
      refusal: { code: 'NOT_IN_FORCE', cause },
    });
  },
);

test('#pickDefinitionMove refuses an undo of a change that does not exist', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: false },
    { kind: 'undo', change: null, definitionID: null, restoredOneShotAt: null, seedSequence: 7 },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'NOT_FOUND' } });
});

test('#pickDefinitionMove refuses to restore a one-shot over a definition the repo holds', () => {
  const change = buildTestDefinitionChange({
    hash: 'h-c2',
    previous: 'h-c1',
    replaces: 'c1',
  });

  const decision = pickDefinitionMove(
    { repo: 'h-r', head: change, now: 1000, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: 2000,
      seedSequence: 7,
    },
  );

  expect(decision).toStrictEqual({
    status: 'refused',
    refusal: { code: 'ONE_SHOT_OVER_REPO' },
  });
});

test('#pickDefinitionMove refuses to restore a one-shot whose time is before the clock reading', () => {
  const change = buildTestDefinitionChange({
    operation: 'add',
    hash: 'h-c2',
    previous: 'h-c1',
    replaces: 'c1',
    base: null,
    definitions: null,
  });

  const decision = pickDefinitionMove(
    { repo: null, head: change, now: 1000, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: 999,
      seedSequence: 7,
    },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'ONE_SHOT_PAST' } });
});

test('#pickDefinitionMove restores a one-shot whose time has not come', () => {
  const change = buildTestDefinitionChange({
    operation: 'add',
    hash: 'h-c2',
    previous: 'h-c1',
    replaces: 'c1',
    base: null,
    definitions: null,
  });

  const decision = pickDefinitionMove(
    { repo: null, head: change, now: 1000, isFileOnly: false },
    {
      kind: 'undo',
      change,
      definitionID: 'water-the-tomatoes',
      restoredOneShotAt: 1001,
      seedSequence: 7,
    },
  );

  expect(decision).toMatchObject({ status: 'move', hash: 'h-c1' });
});

test('#pickDefinitionMove adds a definition that no repo or runtime change holds', () => {
  const decision = pickDefinitionMove(
    { repo: null, head: null, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: false,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toStrictEqual({
    status: 'move',
    operation: 'add',
    definitionID: 'water-the-tomatoes',
    hash: 'h-new',
    previous: null,
    base: null,
    definitions: null,
    replaces: null,
    undoes: null,
    caller: 'conversation',
    restored: null,
  });
});

test('#pickDefinitionMove changes a repo definition and keeps the repo version as the base', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: true,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toMatchObject({
    operation: 'change',
    hash: 'h-new',
    previous: 'h-r',
    base: 'h-r',
    definitions: 'h-r',
    replaces: null,
  });
});

test('#pickDefinitionMove replaces a change in force and keeps its base', () => {
  const head = buildTestDefinitionChange({ base: 'h-b', definitions: 'h-r' });

  const decision = pickDefinitionMove(
    { repo: 'h-r', head, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: true,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toMatchObject({
    previous: 'h-c1',
    base: 'h-b',
    definitions: 'h-r',
    replaces: 'c1',
  });
});

test('#pickDefinitionMove refuses an ID that the repo holds', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: false,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'ID_TAKEN' } });
});

test('#pickDefinitionMove refuses an ID that a runtime change in force holds', () => {
  const head = buildTestDefinitionChange({
    operation: 'add',
    previous: null,
    base: null,
    definitions: null,
  });

  const decision = pickDefinitionMove(
    { repo: null, head, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: false,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'ID_TAKEN' } });
});

test('#pickDefinitionMove frees an ID whose runtime definition an undefine removed', () => {
  const head = buildTestDefinitionChange({
    operation: 'remove',
    hash: null,
    previous: 'h-c1',
    base: null,
    definitions: null,
  });

  const decision = pickDefinitionMove(
    { repo: null, head, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: false,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toMatchObject({ status: 'move', operation: 'add' });
});

test('#pickDefinitionMove refuses to replace a definition that does not exist', () => {
  const decision = pickDefinitionMove(
    { repo: null, head: null, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: true,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'NOT_FOUND' } });
});

test('#pickDefinitionMove refuses a version that holds the hash in force', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: true,
      version: { hash: 'h-r', oneShotAt: null },
    },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'UNCHANGED' } });
});

test('#pickDefinitionMove refuses a one-shot over a repo definition', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: false },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: true,
      version: { hash: 'h-new', oneShotAt: 1 },
    },
  );

  expect(decision).toStrictEqual({
    status: 'refused',
    refusal: { code: 'ONE_SHOT_OVER_REPO' },
  });
});

test('#pickDefinitionMove removes a repo definition with an undefine that holds a null hash', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: false },
    { kind: 'undefine', definitionID: 'water-the-tomatoes' },
  );

  expect(decision).toMatchObject({
    status: 'move',
    operation: 'remove',
    hash: null,
    previous: 'h-r',
    base: 'h-r',
    caller: 'conversation',
  });
});

test('#pickDefinitionMove refuses an undefine of a definition that does not exist', () => {
  const decision = pickDefinitionMove(
    { repo: null, head: null, now: 0, isFileOnly: false },
    { kind: 'undefine', definitionID: 'water-the-tomatoes' },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'NOT_FOUND' } });
});

test('#pickDefinitionMove refuses a replacement of a definition that holds a file-only key', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: true },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: true,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'FILE_ONLY_KEYS' } });
});

test('#pickDefinitionMove refuses an ID taken before it checks the file-only keys', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: true },
    {
      kind: 'define',
      definitionID: 'water-the-tomatoes',
      isReplace: false,
      version: { hash: 'h-new', oneShotAt: null },
    },
  );

  expect(decision).toStrictEqual({ status: 'refused', refusal: { code: 'ID_TAKEN' } });
});

test('#pickDefinitionMove allows an undefine of a definition that holds a file-only key', () => {
  const decision = pickDefinitionMove(
    { repo: 'h-r', head: null, now: 0, isFileOnly: true },
    { kind: 'undefine', definitionID: 'water-the-tomatoes' },
  );

  expect(decision).toMatchObject({ status: 'move', operation: 'remove' });
});
