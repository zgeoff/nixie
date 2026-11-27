import { expect, test } from 'bun:test';
import { applyPlacesSeedPlan } from './apply-places-seed-plan';

test('it takes out each entry the plan removes and puts in each entry it adds', () => {
  const refs = applyPlacesSeedPlan(
    [
      { placeID: 'p1', trust: 'known' },
      { placeID: 'p2', trust: 'act' },
    ],
    {
      adds: [
        {
          placeID: 'p3',
          shortID: 'k3p9m2x7qa',
          key: { kind: 'mail_domain', domain: 'example.org', subdomains: false },
          trust: 'blocked',
          name: null,
        },
      ],
      removes: ['p1'],
    },
  );

  expect(refs).toStrictEqual([
    { placeID: 'p2', trust: 'act' },
    { placeID: 'p3', trust: 'blocked' },
  ]);
});
