import { expect, test } from 'bun:test';
import { buildServerFacts } from '../test-utils/build-server-facts';
import type { ServerFacts } from '../types';
import { planServerStart } from './plan-server-start';
import type { HeldServer } from './plan-server-start';

test('it holds and proposes a server that the log has never held', () => {
  const steps = planServerStart({ tracker: buildServerFacts() }, []);

  expect(steps).toStrictEqual([
    { action: 'propose', serverID: 'tracker', facts: buildServerFacts(), replacesProposalID: null },
  ]);
});

test('it does nothing for a server whose entry matches the facts in use', () => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'added',
    inUse: buildServerFacts(),
    requested: null,
    proposalID: null,
  };

  expect(planServerStart({ tracker: buildServerFacts() }, [held])).toStrictEqual([]);
});

test.each<{ title: string; asked: Partial<ServerFacts> }>([
  { title: 'a new URL', asked: { url: 'https://tracker.example.org/v2/mcp' } },
  { title: 'a new client ID', asked: { clientID: 'nixie-9' } },
  { title: 'one more scope', asked: { scope: 'read write admin' } },
  { title: 'trusted switched on', asked: { trusted: true } },
  { title: 'a range where there was none', asked: { privateRange: '10.0.0.0/24' } },
])('it proposes the facts of an added server whose entry has $title', (row) => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'added',
    inUse: buildServerFacts(),
    requested: null,
    proposalID: null,
  };

  const steps = planServerStart({ tracker: buildServerFacts(row.asked) }, [held]);

  expect(steps).toStrictEqual([
    {
      action: 'propose',
      serverID: 'tracker',
      facts: buildServerFacts(row.asked),
      replacesProposalID: null,
    },
  ]);
});

test.each<{ title: string; inUse: Partial<ServerFacts>; asked: Partial<ServerFacts> }>([
  { title: 'fewer scopes', inUse: {}, asked: { scope: 'read' } },
  { title: 'trusted switched off', inUse: { trusted: true }, asked: { trusted: false } },
  {
    title: 'a narrower range',
    inUse: { privateRange: '10.0.0.0/16' },
    asked: { privateRange: '10.0.1.0/24' },
  },
])('it applies at once an entry with $title', (row) => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'added',
    inUse: buildServerFacts(row.inUse),
    requested: null,
    proposalID: null,
  };

  const steps = planServerStart({ tracker: buildServerFacts(row.asked) }, [held]);

  expect(steps).toStrictEqual([
    {
      action: 'narrow',
      serverID: 'tracker',
      facts: buildServerFacts(row.asked),
      replacesProposalID: null,
    },
  ]);
});

test('it replaces the open proposal of a server whose entry widened again', () => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'held',
    inUse: buildServerFacts(),
    requested: buildServerFacts({ scope: 'read write admin' }),
    proposalID: 'proposal-1',
  };

  const steps = planServerStart({ tracker: buildServerFacts({ trusted: true }) }, [held]);

  expect(steps).toStrictEqual([
    {
      action: 'propose',
      serverID: 'tracker',
      facts: buildServerFacts({ trusted: true }),
      replacesProposalID: 'proposal-1',
    },
  ]);
});

test('it proposes nothing again for facts that a proposal already asked for', () => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'held',
    inUse: null,
    requested: buildServerFacts(),
    proposalID: null,
  };

  expect(planServerStart({ tracker: buildServerFacts() }, [held])).toStrictEqual([]);
});

test('it proposes a server again once its entry differs from the declined facts', () => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'held',
    inUse: null,
    requested: buildServerFacts(),
    proposalID: null,
  };

  const steps = planServerStart({ tracker: buildServerFacts({ scope: 'read' }) }, [held]);

  expect(steps).toStrictEqual([
    {
      action: 'propose',
      serverID: 'tracker',
      facts: buildServerFacts({ scope: 'read' }),
      replacesProposalID: null,
    },
  ]);
});

test('it restores a held server whose entry returned to the facts in use', () => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'held',
    inUse: buildServerFacts(),
    requested: buildServerFacts({ trusted: true }),
    proposalID: 'proposal-1',
  };

  expect(planServerStart({ tracker: buildServerFacts() }, [held])).toStrictEqual([
    { action: 'restore', serverID: 'tracker' },
  ]);
});

test('it removes a server that left the config, and not one already removed', () => {
  const held: readonly HeldServer[] = [
    {
      serverID: 'tracker',
      state: 'added',
      inUse: buildServerFacts(),
      requested: null,
      proposalID: null,
    },
    { serverID: 'metrics', state: 'removed', inUse: null, requested: null, proposalID: null },
  ];

  expect(planServerStart({}, held)).toStrictEqual([{ action: 'remove', serverID: 'tracker' }]);
});

test('it proposes a removed server again when its entry returns', () => {
  const held: HeldServer = {
    serverID: 'tracker',
    state: 'removed',
    inUse: null,
    requested: null,
    proposalID: null,
  };

  const steps = planServerStart({ tracker: buildServerFacts() }, [held]);

  expect(steps).toStrictEqual([
    { action: 'propose', serverID: 'tracker', facts: buildServerFacts(), replacesProposalID: null },
  ]);
});
