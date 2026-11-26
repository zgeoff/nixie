import { expect, test } from 'bun:test';
import {
  collectGatewayPriceIssues,
  collectMissingPriceIssues,
} from './collect-missing-price-issues';

function setupTest() {
  return {
    prices: { input: 3, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
  };
}

test('it collects nothing when every profile that a role or a selectable model runs on sets prices', () => {
  const ctx = setupTest();

  expect(
    collectMissingPriceIssues({
      profiles: { 'chat-direct': { prices: ctx.prices }, 'worker-a': { prices: ctx.prices } },
      roles: { conversation: 'chat-direct', worker: 'worker-a' },
      selectable: [{ name: 'second-look', profile: 'chat-direct' }],
    }),
  ).toStrictEqual([]);
});

test("it names an unset task role when the conversation's profile, which tasks then run on, sets no prices", () => {
  expect(
    collectMissingPriceIssues({
      profiles: { 'chat-direct': { prices: null } },
      roles: { conversation: 'chat-direct' },
      selectable: [],
    }),
  ).toStrictEqual([
    {
      path: ['models', 'roles', 'task'],
      message:
        "the task role is unset, so tasks run on the conversation's profile chat-direct, which sets no prices",
    },
  ]);
});

test('it names a task role whose profile sets no prices', () => {
  const ctx = setupTest();

  expect(
    collectMissingPriceIssues({
      profiles: { 'chat-direct': { prices: ctx.prices }, 'task-codex': { prices: null } },
      roles: { conversation: 'chat-direct', task: 'task-codex' },
      selectable: [],
    }),
  ).toStrictEqual([
    {
      path: ['models', 'roles', 'task'],
      message: 'the task role names the profile task-codex, which sets no prices',
    },
  ]);
});

test('it names a worker role whose profile sets no prices', () => {
  const ctx = setupTest();

  expect(
    collectMissingPriceIssues({
      profiles: { 'chat-direct': { prices: ctx.prices }, 'worker-bare': { prices: null } },
      roles: { conversation: 'chat-direct', worker: 'worker-bare' },
      selectable: [],
    }),
  ).toStrictEqual([
    {
      path: ['models', 'roles', 'worker'],
      message:
        'the worker role names the profile worker-bare, which sets no prices, and a worker run counts its cost against its dollar limit',
    },
  ]);
});

test('it names a selectable model whose profile sets no prices', () => {
  const ctx = setupTest();

  expect(
    collectMissingPriceIssues({
      profiles: { 'chat-direct': { prices: ctx.prices }, 'second-bare': { prices: null } },
      roles: { conversation: 'chat-direct' },
      selectable: [{ name: 'second-look', profile: 'second-bare' }],
    }),
  ).toStrictEqual([
    {
      path: ['models', 'selectable', 'second-look', 'profile'],
      message:
        'the selectable model second-look names the profile second-bare, which sets no prices',
    },
  ]);
});

test('it names each profile that sets prices beside a gateway, and names the route prices', () => {
  const ctx = setupTest();

  expect(
    collectGatewayPriceIssues({
      'chat-direct': { prices: ctx.prices },
      'worker-bare': { prices: null },
    }),
  ).toStrictEqual([
    {
      path: ['models', 'profiles', 'chat-direct', 'prices'],
      message:
        "the profile chat-direct sets prices, and the spendStop section is set, so the model gateway prices each reply from the prices of its route: remove the profile's prices and set the route's prices in the gateway's config",
    },
  ]);
});

test('it names nothing beside a gateway when no profile sets prices', () => {
  expect(collectGatewayPriceIssues({ 'worker-bare': { prices: null } })).toStrictEqual([]);
});
