import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { startGmailTools } from '../test-utils/start-gmail-tools';
import { calendarDeclarations } from './calendar-declarations';

test.each([
  { tool: 'calendar.list_calendars', effects: ['read'], execution: 'direct', destinations: [] },
  { tool: 'calendar.list_events', effects: ['read'], execution: 'direct', destinations: [] },
  { tool: 'calendar.read_event', effects: ['read'], execution: 'direct', destinations: [] },
  { tool: 'calendar.create_event', effects: ['write'], execution: 'queued', destinations: [] },
  {
    tool: 'calendar.create_event_with_guests',
    effects: ['send'],
    execution: 'queued',
    destinations: ['guests'],
  },
  { tool: 'calendar.change_event', effects: ['write'], execution: 'queued', destinations: [] },
  {
    tool: 'calendar.change_event_with_guests',
    effects: ['send'],
    execution: 'queued',
    destinations: [],
  },
  { tool: 'calendar.cancel_event', effects: ['write'], execution: 'queued', destinations: [] },
  {
    tool: 'calendar.cancel_event_with_guests',
    effects: ['send'],
    execution: 'queued',
    destinations: [],
  },
  { tool: 'calendar.respond', effects: ['send'], execution: 'queued', destinations: [] },
])('it declares $tool with the effects $effects and runs it $execution', async (row) => {
  const ctx = await setupTest();

  const tool = ctx.findAction(row.tool).tool;

  expect([tool.declaration.effects, tool.execution, tool.declaration.destinations]).toStrictEqual([
    row.effects,
    row.execution,
    row.destinations,
  ]);
});

function setupTest() {
  return startGmailTools();
}

test('it makes every field that holds someone else words untrusted, and none of them owner data', () => {
  const holding = new Set([
    'calendars',
    'events',
    'title',
    'location',
    'description',
    'organizer',
    'guests',
  ]);

  const sources = Object.values(calendarDeclarations).flatMap((declaration) =>
    Object.entries(declaration.results)
      .filter(([name]) => holding.has(name))
      .map(([, source]) => source),
  );

  expect(sources).toSatisfyAll((source) => source === 'untrusted');
});

test('it keeps the source untrusted for a field that is endorsed, and marks it endorsed in the schema', async () => {
  const ctx = await setupTest();

  const tool = ctx.findAction('calendar.read_event').tool;
  const properties = tool.output['properties'];

  expect([
    tool.declaration.results['start'],
    tool.declaration.results['status'],
    properties,
  ]).toMatchObject([
    'untrusted',
    'untrusted',
    {
      start: { 'x-endorsed': true },
      end: { 'x-endorsed': true },
      isAllDay: { 'x-endorsed': true },
      status: { 'x-endorsed': true },
      yourResponse: { 'x-endorsed': true },
      title: {},
    },
  ]);
});

test('it needs calendar.events for every Calendar tool except the list of calendars', async () => {
  const ctx = await setupTest();

  const scopes = ctx.calendarActions.map((action) => [action.tool.name, action.scopes]);

  expect(scopes).toStrictEqual([
    ['calendar.list_calendars', ['calendar.calendarlist.readonly']],
    ['calendar.list_events', ['calendar.events']],
    ['calendar.read_event', ['calendar.events']],
    ['calendar.create_event', ['calendar.events']],
    ['calendar.create_event_with_guests', ['calendar.events']],
    ['calendar.change_event', ['calendar.events']],
    ['calendar.change_event_with_guests', ['calendar.events']],
    ['calendar.cancel_event', ['calendar.events']],
    ['calendar.cancel_event_with_guests', ['calendar.events']],
    ['calendar.respond', ['calendar.events']],
  ]);
});

test('it checks each queued write with calendar.find_change no sooner than 5 minutes later', async () => {
  const ctx = await setupTest();

  const reconciles = ctx.calendarActions
    .filter((action) => action.queued !== undefined)
    .map((action) => action.reconcile)
    .map(
      (reconcile) =>
        reconcile.kind === 'check' &&
        reconcile.tool === 'calendar.find_change' &&
        reconcile.trustNegativeAfterMs === 300_000,
    );

  expect(reconciles).not.toContain(false);
});

test.each([
  { tool: 'calendar.create_event', onNotFound: 'retry' },
  { tool: 'calendar.change_event', onNotFound: 'retry' },
  { tool: 'calendar.cancel_event', onNotFound: 'retry' },
  { tool: 'calendar.create_event_with_guests', onNotFound: 'ask' },
  { tool: 'calendar.change_event_with_guests', onNotFound: 'ask' },
  { tool: 'calendar.cancel_event_with_guests', onNotFound: 'ask' },
  { tool: 'calendar.respond', onNotFound: 'ask' },
])('it answers a check of $tool that finds nothing with $onNotFound', async (row) => {
  const ctx = await setupTest();

  const reconcile = ctx.findAction(row.tool).reconcile;
  const onNotFound = reconcile.kind === 'check' ? reconcile.onNotFound : null;

  expect(onNotFound).toBe(row.onNotFound);
});

test('it registers every Calendar tool, each result field with a source', async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry(ctx.calendarActions.map((action) => action.tool));

  expect(registry.toolNames).toHaveLength(10);
});
