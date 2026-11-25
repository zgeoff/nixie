import { expect, test } from 'bun:test';
import type { McpToolOverride } from '@heynixie/policy';
import { buildToolForm } from '../test-utils/build-tool-form';
import { pickFitFault } from './pick-fit-fault';

function setupTest() {
  const form = buildToolForm({
    name: 'item_notify',
    inputSchema: {
      type: 'object',
      properties: {
        assignee_email: { type: 'string' },
        request_id: { type: 'string' },
        price: { type: 'number' },
        filter: { type: 'object', properties: { owner: { type: 'string' } } },
      },
    },
  });

  return {
    judge: (fields: Partial<McpToolOverride>) =>
      pickFitFault(
        {
          effects: ['send'],
          destinations: [],
          amount: null,
          content: null,
          reconcile: null,
          ...fields,
        },
        form,
        new Set(['item_get', 'item_notify']),
      ),
  };
}

test('it accepts an override that names only arguments the schema holds', () => {
  const ctx = setupTest();

  const fault = ctx.judge({
    destinations: ['assignee_email'],
    amount: 'price',
    content: ['filter.owner'],
    reconcile: { idempotencyKey: 'request_id' },
  });

  expect(fault).toBeNull();
});

test.each<[string, Partial<McpToolOverride>, string]>([
  ['a destination the schema lacks', { destinations: ['to'] }, 'to'],
  ['an amount the schema lacks', { amount: 'cost' }, 'cost'],
  ['a content argument the schema lacks', { content: ['body'] }, 'body'],
  [
    'a nested destination, which a destination may not be',
    { destinations: ['filter.owner'] },
    'filter.owner',
  ],
  ['an idempotency key the schema lacks', { reconcile: { idempotencyKey: 'key' } }, 'key'],
])('it names %s', (_name, fields, argument) => {
  const ctx = setupTest();

  expect(ctx.judge(fields)).toBe(`the override names ${argument}, which the input schema lacks`);
});

test('it names a check tool the server lacks', () => {
  const ctx = setupTest();

  expect(ctx.judge({ reconcile: { check: 'item_find' } })).toBe(
    'the override checks with item_find, which the server lacks',
  );
});

test('it accepts a check tool the server lists', () => {
  const ctx = setupTest();

  expect(ctx.judge({ reconcile: { check: 'item_get' } })).toBeNull();
});

test('it accepts a destination that a member of the root anyOf holds', () => {
  const form = buildToolForm({
    name: 'item_notify',
    inputSchema: {
      type: 'object',
      anyOf: [
        { type: 'object', properties: { assignee_email: { type: 'string' } } },
        { type: 'object', properties: { team_email: { type: 'string' } } },
      ],
    },
  });

  const override: McpToolOverride = {
    effects: ['send'],
    destinations: ['team_email'],
    amount: null,
    content: null,
    reconcile: null,
  };

  expect(pickFitFault(override, form, new Set(['item_notify']))).toBeNull();
});

test('it accepts a destination that the root names through a local ref', () => {
  const form = buildToolForm({
    name: 'item_notify',
    inputSchema: {
      $ref: '#/$defs/args',
      $defs: { args: { type: 'object', properties: { assignee_email: { type: 'string' } } } },
    },
  });

  const override: McpToolOverride = {
    effects: ['send'],
    destinations: ['assignee_email'],
    amount: null,
    content: ['assignee_email'],
    reconcile: null,
  };

  expect(pickFitFault(override, form, new Set(['item_notify']))).toBeNull();
});

test('it accepts an override that names a string argument beside a local ref', () => {
  const form = buildToolForm({
    name: 'item_notify',
    inputSchema: {
      type: 'object',
      $defs: { base: { type: 'object', properties: { name: { type: 'string' } } } },
      $ref: '#/$defs/base',
      properties: { note: { type: 'string' } },
    },
  });

  const fault = pickFitFault(
    {
      effects: ['send'],
      destinations: ['note'],
      amount: null,
      content: ['name', 'note'],
      reconcile: null,
    },
    form,
    new Set(['item_notify']),
  );

  expect(fault).toBeNull();
});
