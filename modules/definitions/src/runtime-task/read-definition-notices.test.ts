import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildTestDefineInput } from '../test-utils/build-test-define-input';
import { seedLostTaskVersions } from '../test-utils/seed-lost-task-versions';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { readDefinitionNotices } from './read-definition-notices';
import { requestDefinitionChange } from './request-definition-change';
import { undoDefinitionChange } from './undo-definition-change';

async function setupTest() {
  const ctx = await startTestDefinitions();

  ctx.clock.advance(Date.parse('2027-03-08T00:00:00Z') - ctx.clock.now());

  await ctx.seed();

  return {
    ...ctx,
    define: async (overrides: Parameters<typeof buildTestDefineInput>[0] = {}) => {
      const result = await requestDefinitionChange(ctx.context, {
        kind: 'define',
        input: buildTestDefineInput(overrides),
      });

      invariant(result.status === 'changed');

      return result;
    },
    readNotices: (changeIDs: readonly string[]) =>
      readDefinitionNotices(ctx.writer.db, changeIDs, {
        now: ctx.clock.now(),
        readZone: () => Promise.resolve('UTC'),
      }),
  };
}

test('it gives an added change in force its words and its next fire', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();
  const notices = await ctx.readNotices([added.changeID]);

  expect(notices.get(added.changeID)).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    name: 'Water the tomatoes',
    operation: 'add',
    shortID: added.shortID,
    changeID: added.changeID,
    hasVersion: true,
    rendered: 'every Friday at 08:00 (UTC)',
    next: 'Fri 12 Mar',
    state: 'in_force',
    isUnreadable: false,
  });
});

test('it marks a replaced change superseded and gives it no next fire', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();

  await ctx.define({ definitionID: 'water-the-tomatoes', brief: 'Water them well.' });

  const notices = await ctx.readNotices([added.changeID]);

  expect(notices.get(added.changeID)).toMatchObject({ state: 'superseded', next: null });
});

test('it names a removed definition from the version before the removal', async () => {
  const ctx = await setupTest();

  await ctx.define();

  const removed = await requestDefinitionChange(ctx.context, {
    kind: 'undefine',
    definitionID: 'water-the-tomatoes',
  });

  invariant(removed.status === 'changed');

  const notices = await ctx.readNotices([removed.changeID]);

  expect(notices.get(removed.changeID)).toMatchObject({
    operation: 'remove',
    name: 'Water the tomatoes',
    rendered: null,
    next: null,
    state: 'adopted',
  });
});

test('it gives an undo of an add the name of the definition and no trigger', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();
  const undone = await undoDefinitionChange(ctx.context, added.changeID);

  invariant(undone.status === 'changed');

  const notices = await ctx.readNotices([undone.changeID]);

  expect(notices.get(undone.changeID)).toMatchObject({
    operation: 'undo',
    name: 'Water the tomatoes',
    hasVersion: false,
    rendered: null,
    next: null,
  });
});

test('it gives an undo that restores a file definition with no trigger its version', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('check-weather', 'name: Check weather\nbrief: Check it.\n');
  await ctx.seed();

  const removed = await requestDefinitionChange(ctx.context, {
    kind: 'undefine',
    definitionID: 'check-weather',
  });

  invariant(removed.status === 'changed');

  const undone = await undoDefinitionChange(ctx.context, removed.changeID);

  invariant(undone.status === 'changed');

  const notices = await ctx.readNotices([undone.changeID]);

  expect(notices.get(undone.changeID)).toMatchObject({
    operation: 'undo',
    name: 'Check weather',
    hasVersion: true,
    rendered: null,
  });
});

test('it gives no notice to a change that has no row', async () => {
  const ctx = await setupTest();
  const notices = await ctx.readNotices(['no-such-change']);

  expect(notices.size).toBe(0);
});

test('it marks a change unreadable when the body of its version is lost', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();

  await seedLostTaskVersions(ctx.writer);

  const notices = await ctx.readNotices([added.changeID]);

  expect(notices.get(added.changeID)).toMatchObject({
    name: null,
    rendered: null,
    next: null,
    isUnreadable: true,
  });
});
