import { expect, test } from 'bun:test';
import { contract } from './contract';
import { liveTopicSchema } from './live-topic-schema';

function setupTest() {
  // The roots whose reads no topic keeps fresh. A new root joins this list or gets a topic.
  const unfollowedRoots = [
    'conversation',
    'devices',
    'files',
    'live',
    'passkeys',
    'reminders',
    'records',
    'recovery',
    'rules',
    'sessions',
  ];

  return { unfollowedRoots, roots: Object.keys(contract) };
}

test('it names a root of the contract for every live topic', () => {
  const ctx = setupTest();

  expect(ctx.roots).toIncludeAllMembers(liveTopicSchema.options);
});

test('it gives every root of the contract a topic or a place on the list of unfollowed roots', () => {
  const ctx = setupTest();

  expect([...liveTopicSchema.options, ...ctx.unfollowedRoots].toSorted()).toStrictEqual(
    ctx.roots.toSorted(),
  );
});
