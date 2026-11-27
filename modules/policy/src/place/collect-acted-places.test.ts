import { expect, test } from 'bun:test';
import { collectActedPlaces } from './collect-acted-places';

test('it owes a record for each act place that allowed a call with an acting effect', () => {
  const owed = collectActedPlaces(
    {
      outcome: 'allow',
      permissions: [
        { by: 'place', placeID: 'p1', trust: 'act' },
        { by: 'place', placeID: 'p2', trust: 'self' },
      ],
      places: [
        { placeID: 'p1', shortID: 's1' },
        { placeID: 'p2', shortID: 's2' },
      ],
    },
    ['send'],
  );

  expect(owed).toStrictEqual([{ placeID: 'p1', shortID: 's1' }]);
});

test('it owes none for a call with only reading effects', () => {
  const owed = collectActedPlaces(
    {
      outcome: 'allow',
      permissions: [{ by: 'place', placeID: 'p1', trust: 'act' }],
      places: [{ placeID: 'p1', shortID: 's1' }],
    },
    ['fetch'],
  );

  expect(owed).toStrictEqual([]);
});

test('it owes none for a call that a rule allowed or that was not allowed', () => {
  expect([
    collectActedPlaces({ outcome: 'allow', permissions: [{ by: 'rule', ruleID: 'r1' }] }, ['send']),
    collectActedPlaces(
      {
        outcome: 'ask',
        permissions: [{ by: 'place', placeID: 'p1', trust: 'act' }],
        places: [{ placeID: 'p1', shortID: 's1' }],
      },
      ['send'],
    ),
  ]).toStrictEqual([[], []]);
});
