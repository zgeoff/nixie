import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { readTestTasks, writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { readListedDefinitions } from '../task/read-listed-definitions';
import { buildTestDefineInput } from '../test-utils/build-test-define-input';
import { buildTestTaskYaml } from '../test-utils/build-test-task-yaml';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { readTaskDefinitionsOverlay } from './read-task-definitions-overlay';
import { requestDefinitionChange } from './request-definition-change';
import { undoDefinitionChange } from './undo-definition-change';

async function setupTest() {
  const ctx = await startTestDefinitions();

  return {
    ...ctx,
    readChanged: () => readRecords(ctx.log, { afterSequence: 0, kinds: ['definition.changed'] }),
    readOverlay: () => readTaskDefinitionsOverlay(ctx.writer.db),
    readBinding: async () => {
      const bindings = await readRecords(ctx.log, {
        afterSequence: 0,
        kinds: ['task.definition_set'],
        order: 'newest',
        limit: 1,
      });

      return bindings[0]?.record.payload['definitionHash'];
    },
  };
}

test('it puts a defined definition in force at once and wakes the export', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({}),
  });

  expect(result).toStrictEqual({
    status: 'changed',
    definitionID: 'water-the-tomatoes',
    changeID: expect.any(String),
    shortID: expect.any(String),
  });

  invariant(result.status === 'changed');

  const overlay = await ctx.readOverlay();

  expect(overlay).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      hash: expect.any(String),
      origin: 'nixie',
      changeID: result.changeID,
      isUnreadable: false,
    },
  ]);

  expect(ctx.readExportWakes()).toBe(1);
});

test('it lists a defined definition as nixie made it, created by its change record', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput({}) });

  const [changed] = await ctx.readChanged();
  const [listed] = await readListedDefinitions(ctx.writer.db);

  invariant(changed);

  expect([listed?.origin, listed?.createdBy]).toStrictEqual([
    'nixie',
    { sequence: changed.record.sequence, kind: 'definition.changed' },
  ]);
});

test('it writes the change on the conversation thread with the version in an erasable field', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput({}) });

  const [changed] = await ctx.readChanged();

  expect(changed?.record).toMatchObject({
    thread: 'conversation',
    payload: {
      definitionID: 'water-the-tomatoes',
      operation: 'add',
      previous: null,
      caller: 'conversation',
      undoes: null,
      replaces: null,
      base: null,
      definitions: null,
    },
    erasable: {
      status: 'readable',
      fields: { version: { definitionID: 'water-the-tomatoes' } },
    },
  });
});

test('it refuses an ID that the repo holds and writes nothing', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ brief: 'Water them well.' }),
  });

  expect(result).toStrictEqual({ status: 'refused', refusal: { code: 'ID_TAKEN' } });

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual([]);
  expect(ctx.readExportWakes()).toBe(0);
});

test('it refuses a replacement that holds the version in force', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes' }),
  });

  expect(result).toStrictEqual({ status: 'refused', refusal: { code: 'UNCHANGED' } });
});

test('it refuses a replacement of a definition that holds an instructions file', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ target: 'task' }), {
    'instructions.md': 'Water the tomatoes at the roots.\n',
  });

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  });

  expect(result).toStrictEqual({ status: 'refused', refusal: { code: 'FILE_ONLY_KEYS' } });
});

test('it refuses a replacement of a definition that holds a file-only key at a non-default value', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask(
    'water-the-tomatoes',
    `${buildTestTaskYaml({ target: 'task' })}wakeable: true\n`,
  );

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  });

  expect(result).toStrictEqual({ status: 'refused', refusal: { code: 'FILE_ONLY_KEYS' } });
});

test('it replaces a definition that holds file-only keys at their defaults', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask(
    'water-the-tomatoes',
    `${buildTestTaskYaml({ target: 'task' })}wakeable: false\ncontext: fresh\ndestinations: []\n`,
  );

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  });

  expect(result).toMatchObject({ status: 'changed' });
});

test('it refuses a replacement of a definition that does not exist', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'feed-the-cat' }),
  });

  expect(result).toStrictEqual({ status: 'refused', refusal: { code: 'NOT_FOUND' } });
});

test('it refuses a name that holds no letter or digit', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ name: '!!!' }),
  });

  expect(result).toStrictEqual({
    status: 'refused',
    refusal: { code: 'INVALID', reasons: [expect.any(String)] },
  });
});

test('it refuses a version that the check of a start refuses', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ tools: ['files.write'] }),
  });

  expect(result).toMatchObject({ status: 'refused', refusal: { code: 'INVALID' } });

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual([]);
});

test('it refuses a one-shot over a definition that the repo holds', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({
      definitionID: 'water-the-tomatoes',
      trigger: { at: '2027-03-12T08:00:00+01:00' },
    }),
  });

  expect(result).toStrictEqual({ status: 'refused', refusal: { code: 'ONE_SHOT_OVER_REPO' } });
});

test('it replaces a repo definition and keeps the repo version as the base', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  });

  const [changed] = await ctx.readChanged();

  expect(changed?.record.payload).toMatchObject({
    operation: 'change',
    previous: expect.any(String),
    base: expect.any(String),
    definitions: expect.any(String),
    replaces: null,
  });
});

test('it removes a repo definition from force with an undefine', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'undefine',
    definitionID: 'water-the-tomatoes',
  });

  invariant(result.status === 'changed');

  const overlay = await ctx.readOverlay();

  expect(overlay).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      hash: null,
      origin: 'nixie',
      changeID: result.changeID,
      isUnreadable: false,
    },
  ]);
});

test('it reads the repo before an undefine decides', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const seeds: string[] = [];

  const result = await requestDefinitionChange(
    {
      ...ctx.context,
      runSeed: async () => {
        seeds.push('seed');

        await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());

        return ctx.seed();
      },
    },
    { kind: 'undefine', definitionID: 'water-the-tomatoes' },
  );

  expect(seeds).toStrictEqual(['seed']);
  expect(result).toMatchObject({ status: 'changed' });
});

test('it goes on with the repo version last read when the seed of an undefine fails', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const result = await requestDefinitionChange(
    { ...ctx.context, runSeed: () => Promise.reject(new Error('the repo is unreachable')) },
    { kind: 'undefine', definitionID: 'water-the-tomatoes' },
  );

  expect(result).toMatchObject({ status: 'changed' });
});

test('it refuses an undefine of a definition that does not exist', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const result = await requestDefinitionChange(ctx.context, {
    kind: 'undefine',
    definitionID: 'water-the-tomatoes',
  });

  expect(result).toStrictEqual({ status: 'refused', refusal: { code: 'NOT_FOUND' } });
});

test('it rolls back with no change written when no definitions are in force', async () => {
  const ctx = await setupTest();

  const result = requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({}),
  });

  await Promise.allSettled([result]);

  expect(result).rejects.toThrow('no definitions are in force yet');

  const changed = await ctx.readChanged();

  expect(changed).toStrictEqual([]);
});

test('it adopts a change when a seed reads the merged version', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, { kind: 'define', input: buildTestDefineInput({}) });

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const settled = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['definition.settled'],
  });

  expect(settled.map((entry) => entry.record.payload)).toStrictEqual([
    {
      changeID: expect.any(String),
      definitionID: 'water-the-tomatoes',
      outcome: 'adopted',
      cause: 'seed',
      hash: expect.any(String),
    },
  ]);
});

test('it undoes a defined definition out of force', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const defined = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({}),
  });

  invariant(defined.status === 'changed');

  const undone = await undoDefinitionChange(ctx.context, defined.shortID);

  expect(undone).toStrictEqual({
    status: 'changed',
    definitionID: 'water-the-tomatoes',
    changeID: expect.any(String),
    shortID: expect.any(String),
  });

  const overlay = await ctx.readOverlay();

  expect(overlay).toStrictEqual([]);
});

test('it undoes a replacement by putting the version before it in force', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ brief: 'First.' }),
  });

  const [first] = await ctx.readOverlay();

  const second = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Second.' }),
  });

  invariant(second.status === 'changed');

  await undoDefinitionChange(ctx.context, second.changeID);

  const [after] = await ctx.readOverlay();

  expect(after?.hash).toBe(first?.hash);
});

test('it refuses an undo of a change that a later change replaced', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const first = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ brief: 'First.' }),
  });

  const second = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Second.' }),
  });

  invariant(first.status === 'changed');
  invariant(second.status === 'changed');

  const undone = await undoDefinitionChange(ctx.context, first.changeID);

  expect(undone).toStrictEqual({
    status: 'refused',
    refusal: {
      code: 'REPLACED',
      head: { changeID: second.changeID, shortID: second.shortID, operation: 'change' },
    },
  });
});

test('it names the last accepted seed when an undo meets a repo that moved back after the adoption', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Original.' }));
  await ctx.seed();

  const changed = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes' }),
  });

  invariant(changed.status === 'changed');

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Soak them.' }));
  await ctx.seed();
  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();
  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Soak them.' }));

  const lastSeed = await ctx.seed();

  invariant(lastSeed.status === 'seeded');

  const undone = await undoDefinitionChange(ctx.context, changed.changeID);

  expect(undone).toStrictEqual({
    status: 'refused',
    refusal: { code: 'REPO_MOVED', seedSequence: lastSeed.inForce.recordSequence },
  });
});

test('it refuses an undo of a change that does not exist', async () => {
  const ctx = await setupTest();

  await ctx.seed();

  const undone = await undoDefinitionChange(ctx.context, 'no-such-change');

  expect(undone).toStrictEqual({ status: 'refused', refusal: { code: 'NOT_FOUND' } });
});

test('it ends with the merged version in force when the undo seed reads the merge', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const changed = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  });

  invariant(changed.status === 'changed');

  const merged = buildTestTaskYaml({ brief: 'Water them well.' });

  const undone = await undoDefinitionChange(
    {
      ...ctx.context,
      runSeed: async () => {
        await ctx.writeRepoTask('water-the-tomatoes', merged);

        return ctx.seed();
      },
    },
    changed.changeID,
  );

  const [overlaid] = await ctx.readOverlay();

  expect(undone).toMatchObject({ status: 'changed' });
  expect(overlaid).toMatchObject({ origin: 'nixie', hash: expect.any(String) });
});

test('it ends with the merged version in force when the undo seed fails', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  const changed = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' }),
  });

  invariant(changed.status === 'changed');

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ brief: 'Water them well.' }));

  const undone = await undoDefinitionChange(
    { ...ctx.context, runSeed: () => Promise.reject(new Error('the repo is unreachable')) },
    changed.changeID,
  );

  await ctx.seed();

  const [overlaid] = await ctx.readOverlay();

  expect(undone).toMatchObject({ status: 'changed' });

  expect(overlaid).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    hash: expect.any(String),
    origin: 'definitions',
    changeID: null,
    isUnreadable: false,
  });
});

test('it leaves the hash that an unread fire pinned after a define and after an undo', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml({ target: 'task' }));
  await ctx.seed();

  const [task] = await readTestTasks(ctx.writer);
  const [repoVersion] = await ctx.readOverlay();

  await writeTestTriggerFire(
    { log: ctx.log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
    task?.id ?? '',
    { definitionHash: repoVersion?.hash ?? '' },
  );

  const defined = await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({
      definitionID: 'water-the-tomatoes',
      target: 'task',
      brief: 'Water them well.',
    }),
  });

  invariant(defined.status === 'changed');

  const afterDefine = await ctx.readBinding();

  await undoDefinitionChange(ctx.context, defined.changeID);

  const afterUndo = await ctx.readBinding();
  const fires = await readRecords(ctx.log, { afterSequence: 0, kinds: ['trigger.fired'] });

  expect(fires.map((entry) => entry.record.payload['definitionHash'])).toStrictEqual([
    repoVersion?.hash,
  ]);

  expect(afterDefine).not.toBe(repoVersion?.hash);
  expect(afterUndo).toBe(repoVersion?.hash);
});
