import { expect, test } from 'bun:test';
import type { DestinationPermission } from '@heynixie/log';
import { pickDestinationPermissions } from './pick-destination-permissions';

test.each<[string, string, DestinationPermission | null]>([
  ['an exact address', 'orders@grocer.example', 'rule'],
  ['a whole domain', '*@grocer.example', null],
  ['a wildcard in the local part', 'orders*@grocer.example', null],
])(
  'it picks for an email address and %s as a rule pattern the permission %s',
  (_title, pattern, expected) => {
    const permissions = pickDestinationPermissions(
      [{ value: 'orders@grocer.example', replyTarget: false }],
      {
        ownerDestinations: [],
        contacts: [],
        taskDestinations: [],
        allowRules: [{ id: 'allow-mail', outcome: 'allow', destinations: [pattern] }],
      },
    );

    expect(permissions).toStrictEqual([expected]);
  },
);

test.each<[string, string, DestinationPermission | null]>([
  ['an exact address', 'orders@grocer.example', 'task'],
  ['a whole domain', '*@grocer.example', null],
])(
  'it picks for an email address and %s as a task destination the permission %s',
  (_title, pattern, expected) => {
    const permissions = pickDestinationPermissions(
      [{ value: 'orders@grocer.example', replyTarget: false }],
      { ownerDestinations: [], contacts: [], taskDestinations: [pattern], allowRules: [] },
    );

    expect(permissions).toStrictEqual([expected]);
  },
);

test('it picks the rule permission for a wildcard pattern over a destination that is no email address', () => {
  const permissions = pickDestinationPermissions(
    [{ value: 'https://grocer.example/cart', replyTarget: false }],
    {
      ownerDestinations: [],
      contacts: [],
      taskDestinations: [],
      allowRules: [
        { id: 'allow-shop', outcome: 'allow', destinations: ['https://grocer.example/*'] },
      ],
    },
  );

  expect(permissions).toStrictEqual(['rule']);
});
