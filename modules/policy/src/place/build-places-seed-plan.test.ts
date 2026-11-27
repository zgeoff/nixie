import { expect, test } from 'bun:test';
import { buildPlacesSeedPlan } from './build-places-seed-plan';

test('it adds each place of the file that no entry holds', () => {
  const plan = buildPlacesSeedPlan(
    [
      {
        key: { kind: 'site', domain: 'library.example.org', subdomains: true },
        trust: 'read',
        name: null,
      },
    ],
    [],
  );

  expect({
    adds: plan.adds.map((add) => [add.key, add.trust]),
    removes: plan.removes,
  }).toStrictEqual({
    adds: [[{ kind: 'site', domain: 'library.example.org', subdomains: true }, 'read']],
    removes: [],
  });
});

test('it removes an entry that it added and the file no longer lists', () => {
  const plan = buildPlacesSeedPlan(
    [],
    [
      {
        placeID: 'p1',
        key: { kind: 'site', domain: 'library.example.org', subdomains: false },
        trust: 'read',
        name: null,
        addedBy: 'seed',
        isChanged: false,
      },
    ],
  );

  expect(plan).toStrictEqual({ adds: [], removes: ['p1'] });
});

test('it leaves an entry that you added or changed where it is', () => {
  const key = { kind: 'site', domain: 'library.example.org', subdomains: false } as const;

  const plan = buildPlacesSeedPlan(
    [{ key, trust: 'blocked', name: 'The library' }],
    [
      { placeID: 'yours', key, trust: 'act', name: null, addedBy: 'you', isChanged: false },
      {
        placeID: 'edited',
        key: { kind: 'site', domain: 'other.example.org', subdomains: false },
        trust: 'act',
        name: null,
        addedBy: 'seed',
        isChanged: true,
      },
    ],
  );

  expect(plan).toStrictEqual({ adds: [], removes: [] });
});

test('it replaces an entry that it added when the file changes its level', () => {
  const key = { kind: 'mail_domain', domain: 'example.org', subdomains: false } as const;

  const plan = buildPlacesSeedPlan(
    [{ key, trust: 'blocked', name: null }],
    [{ placeID: 'p1', key, trust: 'known', name: null, addedBy: 'seed', isChanged: false }],
  );

  expect({
    adds: plan.adds.map((add) => add.trust),
    removes: plan.removes,
  }).toStrictEqual({ adds: ['blocked'], removes: ['p1'] });
});

test('it replaces an entry that it added when the file changes only its name', () => {
  const key = { kind: 'site', domain: 'library.example.org', subdomains: false } as const;

  const plan = buildPlacesSeedPlan(
    [{ key, trust: 'read', name: 'The town library' }],
    [{ placeID: 'p1', key, trust: 'read', name: 'The library', addedBy: 'seed', isChanged: false }],
  );

  expect({
    adds: plan.adds.map((add) => [add.trust, add.name]),
    removes: plan.removes,
  }).toStrictEqual({ adds: [['read', 'The town library']], removes: ['p1'] });
});

test('it changes nothing for a file that the entries already match', () => {
  const key = { kind: 'site', domain: 'library.example.org', subdomains: false } as const;

  const plan = buildPlacesSeedPlan(
    [{ key, trust: 'read', name: 'The library' }],
    [{ placeID: 'p1', key, trust: 'read', name: 'The library', addedBy: 'seed', isChanged: false }],
  );

  expect(plan).toStrictEqual({ adds: [], removes: [] });
});
