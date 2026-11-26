import { expect, test } from 'bun:test';
import { initialHealth } from '../health/types';
import { buildServerRow } from '../test-utils/build-server-row';
import { buildToolRow } from '../test-utils/build-tool-row';
import { buildServerViews } from './build-server-views';

function setupTest() {
  return {
    signedIn: JSON.stringify({ issuer: 'https://auth.example.org' }),
    read: (input: Partial<Parameters<typeof buildServerViews>[0]>) =>
      buildServerViews({
        servers: [],
        tools: [],
        signIns: new Map(),
        getHealth: () => initialHealth,
        openProposalIDs: new Set<string>(),
        ...input,
      }),
  };
}

test('it leaves out a removed server', () => {
  const ctx = setupTest();

  expect(ctx.read({ servers: [buildServerRow({ state: 'removed' })] })).toStrictEqual([]);
});

test('it shows a held server as not added', () => {
  const ctx = setupTest();

  expect(ctx.read({ servers: [buildServerRow({ state: 'held' })] })[0]?.signIn).toBe('not_added');
});

test('it shows an added server with no recorded sign-in as having no grant', () => {
  const ctx = setupTest();

  expect(ctx.read({ servers: [buildServerRow({ grant_binding: null })] })[0]?.signIn).toBe(
    'no_grant',
  );
});

test('it shows a signed-in server as ok, and as needing consent once a listing found it dead', () => {
  const ctx = setupTest();
  const servers = [buildServerRow({ grant_binding: ctx.signedIn })];

  expect([
    ctx.read({ servers })[0]?.signIn,
    ctx.read({ servers, signIns: new Map([['tracker', 'needs_sign_in']]) })[0]?.signIn,
  ]).toStrictEqual(['ok', 'needs_consent']);
});

test('it carries the last error of an unhealthy server and the tools of each server', () => {
  const ctx = setupTest();

  const views = ctx.read({
    servers: [buildServerRow({ grant_binding: ctx.signedIn })],
    tools: [
      buildToolRow({ tool: 'tracker.item_get' }),
      buildToolRow({ tool: 'other.thing', server_id: 'other' }),
    ],
    getHealth: () => ({
      ...initialHealth,
      failures: 3,
      isUnhealthy: true,
      lastError: 'timeout',
      nextTryAtMs: 5000,
    }),
  });

  expect(views).toMatchObject([
    {
      health: 'unhealthy',
      lastError: 'timeout',
      nextTryAtMs: 5000,
      tools: [{ tool: 'tracker.item_get', state: 'exposed' }],
    },
  ]);
});

test('it carries the proposal of a row only while that proposal is open', () => {
  const ctx = setupTest();

  const views = ctx.read({
    servers: [buildServerRow({ proposal_id: 'p-server' })],
    tools: [
      buildToolRow({ tool: 'tracker.open', proposal_id: 'p-open' }),
      buildToolRow({ tool: 'tracker.closed', proposal_id: 'p-closed' }),
    ],
    openProposalIDs: new Set(['p-open']),
  });

  expect([views[0]?.proposalID, views[0]?.tools.map((tool) => tool.proposalID)]).toStrictEqual([
    null,
    ['p-open', null],
  ]);
});
