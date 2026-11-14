import { expect, test } from 'bun:test';
import { withWriteTransaction } from '../record/with-write-transaction';
import { startTestLog } from '../test-utils/start-test-log';
import { pauseNixieInTransaction } from './pause-nixie-in-transaction';
import { readPauseSince } from './read-pause-since';
import { resumeNixieInTransaction } from './resume-nixie-in-transaction';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, definitions: { snapshotHash: 'sha256:aa11' } };
}

test('it reads null while nixie is not paused', async () => {
  const ctx = await setupTest();
  const pause = await withWriteTransaction(ctx.writer, (tx) => readPauseSince(tx));

  expect(pause).toBeNull();
});

test('it reads the cause and the time the pause was recorded', async () => {
  const ctx = await setupTest();

  const pausedAt = ctx.clock.now();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: ctx.definitions,
    }),
  );

  ctx.clock.advance(60_000);

  const pause = await withWriteTransaction(ctx.writer, (tx) => readPauseSince(tx));

  expect(pause).toStrictEqual({ cause: 'owner', recoveryID: null, since: pausedAt });
});

test('it reads null after the resume', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: ctx.definitions,
    });

    await resumeNixieInTransaction(tx, ctx.log, { by: 'session-a', definitions: ctx.definitions });
  });

  const pause = await withWriteTransaction(ctx.writer, (tx) => readPauseSince(tx));

  expect(pause).toBeNull();
});
