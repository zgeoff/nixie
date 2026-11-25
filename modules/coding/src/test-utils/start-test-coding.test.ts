import { expect, test } from 'bun:test';
import { startTestCoding } from './start-test-coding';

function setupTest() {
  return startTestCoding();
}

test('#startTask returns a different ID for each task it starts', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const first = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  const second = await ctx.startTask(claim, {
    name: 'Fix the flaky signup test',
    brief: 'Find why the signup test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  expect([first, second]).toSatisfyAll((taskID: string) => taskID.length > 0);
  expect(second).not.toBe(first);
});

test('#startTask throws when coding.start does not succeed', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const started = ctx.startTask(claim, { name: 'Nothing', brief: 'x' });

  await expect(started).toReject();
});
