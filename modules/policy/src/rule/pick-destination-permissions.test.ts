import { expect, test } from 'bun:test';
import type { DestinationPermission } from '@heynixie/log';
import type { PlaceEntry } from '../place/types';
import type { FoundDestination } from './pick-destination-permissions';
import { pickDestinationPermissions } from './pick-destination-permissions';

test.each<[string, string, DestinationPermission | null]>([
  ['an exact address', 'orders@grocer.example', { by: 'rule', ruleID: 'allow-mail' }],
  ['a whole domain', '*@grocer.example', null],
  ['a wildcard in the local part', 'orders*@grocer.example', null],
])(
  'it picks for an email address and %s as a rule pattern the permission %j',
  (_title, pattern, expected) => {
    const permissions = pickDestinationPermissions(
      [
        {
          destination: { value: 'orders@grocer.example', replyTarget: false },
          isParsed: true,
          place: null,
        },
      ],
      {
        isReadingCall: false,
        taskDestinations: [],
        allowRules: [
          {
            id: 'allow-mail',
            revision: 1,
            rule: { id: 'allow-mail', outcome: 'allow', destinations: [pattern] },
          },
        ],
      },
    );

    expect(permissions).toStrictEqual([expected]);
  },
);

test.each<[string, string, DestinationPermission | null]>([
  ['an exact address', 'orders@grocer.example', { by: 'task' }],
  ['a whole domain', '*@grocer.example', null],
])(
  'it picks for an email address and %s as a task destination the permission %j',
  (_title, pattern, expected) => {
    const permissions = pickDestinationPermissions(
      [
        {
          destination: { value: 'orders@grocer.example', replyTarget: false },
          isParsed: true,
          place: null,
        },
      ],
      { isReadingCall: false, taskDestinations: [pattern], allowRules: [] },
    );

    expect(permissions).toStrictEqual([expected]);
  },
);

test('it picks the rule permission for a wildcard pattern over a destination that is no email address', () => {
  const permissions = pickDestinationPermissions(
    [
      {
        destination: { value: 'https://grocer.example/cart', replyTarget: false },
        isParsed: true,
        place: null,
      },
    ],
    {
      isReadingCall: false,
      taskDestinations: [],
      allowRules: [
        {
          id: 'allow-shop',
          revision: 1,
          rule: { id: 'allow-shop', outcome: 'allow', destinations: ['https://grocer.example/*'] },
        },
      ],
    },
  );

  expect(permissions).toStrictEqual([{ by: 'rule', ruleID: 'allow-shop' }]);
});

test('it matches a rule pattern in any case, and a handle exactly', () => {
  const rules = [
    {
      id: 'allow-mail',
      revision: 1,
      rule: {
        id: 'allow-mail',
        outcome: 'allow' as const,
        destinations: ['Sam@Example.org', 'telegram:Ab1'],
      },
    },
  ];

  const permissions = pickDestinationPermissions(
    [
      {
        destination: { value: 'sam@example.org', replyTarget: false },
        isParsed: true,
        place: null,
      },
      { destination: { value: 'telegram:ab1', replyTarget: false }, isParsed: true, place: null },
      { destination: { value: 'telegram:Ab1', replyTarget: false }, isParsed: true, place: null },
    ],
    { isReadingCall: false, taskDestinations: [], allowRules: rules },
  );

  expect(permissions).toStrictEqual([
    { by: 'rule', ruleID: 'allow-mail' },
    null,
    { by: 'rule', ruleID: 'allow-mail' },
  ]);
});

test('it gives the place permission before a reply target or a rule', () => {
  const place: PlaceEntry = {
    placeID: 'p1',
    shortID: 's1',
    key: { kind: 'address', address: 'sam@example.org' },
    trust: 'act',
  };

  const found: FoundDestination = {
    destination: { value: 'sam@example.org', replyTarget: true },
    isParsed: true,
    place,
  };

  expect(
    pickDestinationPermissions([found], {
      isReadingCall: false,
      taskDestinations: [],
      allowRules: [],
    }),
  ).toStrictEqual([{ by: 'place', placeID: 'p1', trust: 'act' }]);
});

test.each<[string, boolean, boolean, DestinationPermission | null]>([
  ['a call with only reading effects', true, true, { by: 'reading' }],
  ['a call that acts', false, true, null],
  ['a destination that parses to nothing', true, false, null],
])(
  'it gives a destination with no entry on %s the permission %j',
  (_title, isReadingCall, isParsed, expected) => {
    const permissions = pickDestinationPermissions(
      [{ destination: { value: 'example.org', replyTarget: false }, isParsed, place: null }],
      { isReadingCall, taskDestinations: [], allowRules: [] },
    );

    expect(permissions).toStrictEqual([expected]);
  },
);
