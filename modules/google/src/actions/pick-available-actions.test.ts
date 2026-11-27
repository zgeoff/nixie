import { expect, test } from 'bun:test';
import type { ConnectorAction } from '@heynixie/connections';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import { collectHeldBackTools, pickAvailableActions } from './pick-available-actions';

function setupTest() {
  const specs: readonly (readonly [string, readonly string[]])[] = [
    ['stub.read_mail', ['gmail.modify']],
    ['stub.list_calendars', ['calendar.calendarlist.readonly']],
    ['stub.read_events', ['calendar.events']],
    ['stub.plain', []],
  ];

  const actions = specs.map(([name, scopes]): ConnectorAction => ({
    tool: buildMockToolDefinition({ name }),
    scopes,
    reconcile: { kind: 'none' },
  }));

  return { actions };
}

test.each([
  {
    title: 'no scope is missing',
    missing: [],
    expected: ['stub.read_mail', 'stub.list_calendars', 'stub.read_events', 'stub.plain'],
  },
  {
    title: 'gmail.modify is missing',
    missing: [{ scope: 'gmail.modify', reason: 'not_granted' as const }],
    expected: ['stub.list_calendars', 'stub.read_events', 'stub.plain'],
  },
  {
    title: 'a scope is missing because its API is off',
    missing: [{ scope: 'calendar.events', reason: 'api_disabled' as const }],
    expected: ['stub.read_mail', 'stub.list_calendars', 'stub.plain'],
  },
  {
    title: 'every scope is missing',
    missing: [
      { scope: 'gmail.modify', reason: 'not_granted' as const },
      { scope: 'calendar.events', reason: 'not_granted' as const },
      { scope: 'calendar.calendarlist.readonly', reason: 'not_granted' as const },
    ],
    expected: ['stub.plain'],
  },
])('#pickAvailableActions leaves out the tools of a scope when $title', (row) => {
  const names = pickAvailableActions(setupTest().actions, row.missing).map(
    (action) => action.tool.name,
  );

  expect(names).toStrictEqual([...row.expected]);
});

test('#collectHeldBackTools names the tools one scope holds back', () => {
  expect(collectHeldBackTools(setupTest().actions, 'calendar.events')).toStrictEqual([
    'stub.read_events',
  ]);
});
