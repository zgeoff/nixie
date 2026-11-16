import { expect, test } from 'bun:test';
import { readTaskDefinitionsOverlay } from '@heynixie/definitions';
import { readTestRuntimeTasks } from '@heynixie/definitions/test-utils';
import { ORPCError } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import invariant from 'tiny-invariant';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { startTestAPIDefinitions } from '../test-utils/start-test-api-definitions';
import { createDefinitionProcedures } from './create-definition-procedures';

async function setupTest() {
  const api = await startTestAPI();
  const definitions = await startTestAPIDefinitions(api);
  const laptop = await createDeviceSession(api.context, 'laptop');

  const procedures = createDefinitionProcedures(api.context, () => definitions.context);

  return {
    api,
    laptop,
    seed: definitions.seed,
    client: createRouterClient(procedures, {
      context: { sessionToken: laptop.token, tokenSource: 'bearer' },
    }),
    signedOut: createRouterClient(procedures, {
      context: { sessionToken: undefined, tokenSource: 'none' },
    }),
    notStarted: createRouterClient(
      createDefinitionProcedures(api.context, () => null),
      { context: { sessionToken: laptop.token, tokenSource: 'bearer' } },
    ),
    writeRepoTask: definitions.writeRepoTask,
    define: definitions.define,
    readOverlay: () => readTaskDefinitionsOverlay(api.writer.db),

    // An error that the procedure throws in process holds the whole call's context, so a matcher
    // that walks it never ends. This keeps only what the contract shows.
    readRefusal: async (call: Promise<unknown>) => {
      const refusal = await call.then(
        () => null,
        (error: unknown) => (error instanceof ORPCError ? error : null),
      );

      if (refusal === null) {
        return null;
      }

      const code: unknown = refusal.code;
      const data: unknown = refusal.data;

      return { code, data };
    },
  };
}

test('#undo takes a change out of force and returns the ID of the undo', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();

  const undone = await ctx.client.undo({
    clientActionID: crypto.randomUUID(),
    changeID: added.shortID,
  });

  expect({ undone, overlay: await ctx.readOverlay() }).toStrictEqual({
    undone: { definitionID: 'water-the-tomatoes', changeID: expect.any(String) },
    overlay: [],
  });
});

test('#undo returns the first result for a reused client action ID and writes no second change', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();

  const input = { clientActionID: crypto.randomUUID(), changeID: added.changeID };

  const first = await ctx.client.undo(input);
  const second = await ctx.client.undo(input);
  const changes = await readTestRuntimeTasks(ctx.api.writer);

  expect({ same: second, changes: changes.length }).toStrictEqual({ same: first, changes: 2 });
});

test('#undo refuses a client action ID that another change used with CLIENT_ACTION_ID_REUSED', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();

  const clientActionID = crypto.randomUUID();

  await ctx.client.undo({ clientActionID, changeID: added.changeID });

  const refusal = await ctx.readRefusal(
    ctx.client.undo({ clientActionID, changeID: 'another-change' }),
  );

  expect(refusal).toStrictEqual({ code: 'CLIENT_ACTION_ID_REUSED', data: undefined });
});

test('#undo refuses a change that does not exist with NOT_FOUND', async () => {
  const ctx = await setupTest();

  const refusal = await ctx.readRefusal(
    ctx.client.undo({ clientActionID: crypto.randomUUID(), changeID: 'no-such-change' }),
  );

  expect(refusal).toStrictEqual({ code: 'NOT_FOUND', data: undefined });
});

test('#undo stores no client action for a refusal, so a retry runs again', async () => {
  const ctx = await setupTest();

  const clientActionID = crypto.randomUUID();

  await ctx.readRefusal(ctx.client.undo({ clientActionID, changeID: 'no-such-change' }));

  const added = await ctx.define();
  const undone = await ctx.client.undo({ clientActionID, changeID: added.changeID });

  expect(undone).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    changeID: expect.any(String),
  });
});

test('#undo refuses a change that a later change replaced with REPLACED and the head', async () => {
  const ctx = await setupTest();
  const added = await ctx.define();

  const changed = await ctx.define({
    definitionID: 'water-the-tomatoes',
    brief: 'Water them well.',
  });

  const refusal = await ctx.readRefusal(
    ctx.client.undo({ clientActionID: crypto.randomUUID(), changeID: added.changeID }),
  );

  expect(refusal).toStrictEqual({
    code: 'REPLACED',
    data: { head: { changeID: changed.changeID, shortID: changed.shortID, operation: 'change' } },
  });
});

test('#undo refuses a change that the repo moved past with REPO_MOVED', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('Water the tomatoes.');
  await ctx.seed();

  const changed = await ctx.define({
    definitionID: 'water-the-tomatoes',
    brief: 'Water them well.',
  });

  await ctx.writeRepoTask('Water them well.');
  await ctx.seed();
  await ctx.writeRepoTask('Water them twice.');
  await ctx.seed();

  const refusal = await ctx.readRefusal(
    ctx.client.undo({ clientActionID: crypto.randomUUID(), changeID: changed.changeID }),
  );

  expect(refusal).toStrictEqual({
    code: 'REPO_MOVED',
    data: { seedSequence: expect.any(Number) },
  });
});

test('#undo refuses a one-time trigger whose time has passed with ONE_SHOT_PAST', async () => {
  const ctx = await setupTest();

  await ctx.define({
    target: 'task',
    trigger: { at: new Date(ctx.api.clock.now() + 60_000).toISOString() },
  });

  await ctx.define({
    definitionID: 'water-the-tomatoes',
    target: 'task',
    brief: 'Water them well.',
  });

  ctx.api.clock.advance(120_000);

  const [changed] = await ctx.readOverlay();

  const changeID = changed?.changeID ?? null;

  invariant(changeID !== null);

  const refusal = await ctx.readRefusal(
    ctx.client.undo({ clientActionID: crypto.randomUUID(), changeID }),
  );

  expect(refusal).toStrictEqual({ code: 'ONE_SHOT_PAST', data: undefined });
});

test('#undo refuses a caller with no session with UNAUTHORIZED', async () => {
  const ctx = await setupTest();

  const refusal = await ctx.readRefusal(
    ctx.signedOut.undo({ clientActionID: crypto.randomUUID(), changeID: 'any' }),
  );

  expect(refusal).toStrictEqual({ code: 'UNAUTHORIZED', data: undefined });
});

test('#undo refuses with NOT_STARTED while the server holds no definitions context', async () => {
  const ctx = await setupTest();

  const refusal = await ctx.readRefusal(
    ctx.notStarted.undo({ clientActionID: crypto.randomUUID(), changeID: 'any' }),
  );

  expect(refusal).toStrictEqual({ code: 'NOT_STARTED', data: undefined });
});
