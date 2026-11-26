import { expect, test } from 'bun:test';
import { createDeviceLeader } from './create-device-leader';

function setupTest() {
  const counts = { started: 0, stopped: 0 };

  const leader = createDeviceLeader(() => {
    counts.started += 1;

    return () => {
      counts.stopped += 1;
    };
  });

  return { leader, counts };
}

test('it keeps its place when one page replaces another in the same step', async () => {
  const ctx = setupTest();
  const releaseFirst = ctx.leader.retain();

  releaseFirst();

  ctx.leader.retain();

  await Promise.resolve();

  expect(ctx.counts).toStrictEqual({ started: 1, stopped: 0 });
});

test('it gives up its place once no page retains it', async () => {
  const ctx = setupTest();
  const releaseFirst = ctx.leader.retain();
  const releaseSecond = ctx.leader.retain();

  releaseFirst();
  releaseSecond();
  releaseSecond();

  await Promise.resolve();

  expect(ctx.counts).toStrictEqual({ started: 1, stopped: 1 });
});
