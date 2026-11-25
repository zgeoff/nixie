import { expect, test } from 'bun:test';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { collectProcedurePaths } from '../test-utils/collect-procedure-paths';
import { readQueryKeyAt } from '../test-utils/read-query-key-at';
import type { ContractClient } from '../types';
import { buildQueryUtils } from './build-query-utils';
import { contract } from './contract';
import { liveTopicSchema } from './live-topic-schema';

function setupTest() {
  // The roots whose reads no topic keeps fresh. A new root joins this list or gets a topic.
  const unfollowedRoots = [
    'calls',
    'conversation',
    'devices',
    'erasure',
    'files',
    'live',
    'passkeys',
    'reminders',
    'records',
    'recovery',
    'rules',
    'sessions',
  ];

  // the query utils that the web client builds, over a client that sends nothing
  const queryUtils = buildQueryUtils(
    createORPCClient<ContractClient>(new RPCLink({ url: 'http://127.0.0.1/rpc' })),
  );

  return { unfollowedRoots, queryUtils, roots: Object.keys(contract) };
}

test('it gives every live topic the query-key root that the web client invalidates, and one root of the contract', () => {
  const ctx = setupTest();
  const topicKeys = liveTopicSchema.options.map((topic) => readQueryKeyAt(ctx.queryUtils, [topic]));

  const rootKeys = ctx.roots
    .filter((root) => liveTopicSchema.safeParse(root).success)
    .map((root) => readQueryKeyAt(ctx.queryUtils, [root]));

  expect(topicKeys.map((key) => JSON.stringify(key)).toSorted()).toStrictEqual(
    rootKeys.map((key) => JSON.stringify(key)).toSorted(),
  );
});

test('it gives every root of the contract a topic or a place on the list of unfollowed roots', () => {
  const ctx = setupTest();

  expect([...liveTopicSchema.options, ...ctx.unfollowedRoots].toSorted()).toStrictEqual(
    ctx.roots.toSorted(),
  );
});

test.each(liveTopicSchema.options)(
  'it keeps every read under the %s topic below the root that the topic invalidates',
  (topic) => {
    const ctx = setupTest();
    const [topicKey] = readQueryKeyAt(ctx.queryUtils, [topic]);

    const keys = collectProcedurePaths(contract[topic], [topic]).map((path) =>
      readQueryKeyAt(ctx.queryUtils, path),
    );

    expect(keys.map((key) => key[0])).toSatisfyAll(
      (procedureKey) =>
        Array.isArray(procedureKey) &&
        Array.isArray(topicKey) &&
        topicKey.every((segment, index) => procedureKey[index] === segment),
    );
  },
);
