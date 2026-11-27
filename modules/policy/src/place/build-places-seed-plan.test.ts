import { expect, test } from 'bun:test';
import { applyPlacesSeedPlan, buildPlacesSeedPlan } from './build-places-seed-plan';

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
    [{ key, trust: 'blocked', name: null }],
    [
      { placeID: 'yours', key, trust: 'act', addedBy: 'you', isChanged: false },
      {
        placeID: 'edited',
        key: { kind: 'site', domain: 'other.example.org', subdomains: false },
        trust: 'act',
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
    [{ placeID: 'p1', key, trust: 'known', addedBy: 'seed', isChanged: false }],
  );

  expect({
    adds: plan.adds.map((add) => add.trust),
    removes: plan.removes,
    refs: applyPlacesSeedPlan([{ placeID: 'p1', trust: 'known' }], plan).map((ref) => ref.trust),
  }).toStrictEqual({ adds: ['blocked'], removes: ['p1'], refs: ['blocked'] });
});

test('it changes nothing for a file that the entries already match', () => {
  const key = { kind: 'site', domain: 'library.example.org', subdomains: false } as const;

  const plan = buildPlacesSeedPlan(
    [{ key, trust: 'read', name: null }],
    [{ placeID: 'p1', key, trust: 'read', addedBy: 'seed', isChanged: false }],
  );

  expect(plan).toStrictEqual({ adds: [], removes: [] });
});
