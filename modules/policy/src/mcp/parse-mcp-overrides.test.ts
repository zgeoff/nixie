import { expect, test } from 'bun:test';
import { parseMcpOverrides } from './parse-mcp-overrides';

test('it parses the file of a server into its tools, with each default filled in', () => {
  const files = new Map([
    [
      'mcp/tracker.yaml',
      [
        'item_create:',
        '  effects: [write]',
        '  content: [title, body]',
        '  reconcile: { idempotencyKey: request_id }',
        'item_notify:',
        '  effects: [send, write, send]',
        '  destinations: [assignee_email]',
        '  reconcile: { check: item_get }',
      ].join('\n'),
    ],
  ]);

  expect(parseMcpOverrides(files)).toStrictEqual({
    status: 'parsed',
    overrides: {
      tracker: {
        item_create: {
          effects: ['write'],
          destinations: [],
          amount: null,
          content: ['title', 'body'],
          reconcile: { idempotencyKey: 'request_id' },
        },
        item_notify: {
          effects: ['send', 'write'],
          destinations: ['assignee_email'],
          amount: null,
          content: null,
          reconcile: { check: 'item_get' },
        },
      },
    },
  });
});

test('it parses an empty file as a server with no tools', () => {
  expect(parseMcpOverrides(new Map([['mcp/tracker.yaml', '']]))).toStrictEqual({
    status: 'parsed',
    overrides: { tracker: {} },
  });
});

test.each([
  ['a file that is not YAML', 'mcp/tracker.yaml', 'item: [unclosed'],
  ['a tool with no effects', 'mcp/tracker.yaml', 'item_get:\n  destinations: [to]\n'],
  ['a tool with an empty effects list', 'mcp/tracker.yaml', 'item_get:\n  effects: []\n'],
  ['an unknown effect', 'mcp/tracker.yaml', 'item_get:\n  effects: [explode]\n'],
  ['an unknown field', 'mcp/tracker.yaml', 'item_get:\n  effects: [read]\n  results: {}\n'],
  [
    'a reconcile that names both a key and a check',
    'mcp/tracker.yaml',
    'item_get:\n  effects: [write]\n  reconcile: { idempotencyKey: a, check: b }\n',
  ],
  ['a file in a subfolder', 'mcp/team/tracker.yaml', 'item_get:\n  effects: [read]\n'],
])('it refuses %s', (_name, path, text) => {
  expect(parseMcpOverrides(new Map([[path, text]]))).toStrictEqual({
    status: 'refused',
    problems: [{ path, reason: expect.any(String) }],
  });
});

test('it refuses 2 files for one server', () => {
  const files = new Map([
    ['mcp/tracker.yaml', 'item_get:\n  effects: [read]\n'],
    ['mcp/tracker.yml', 'item_get:\n  effects: [read]\n'],
  ]);

  expect(parseMcpOverrides(files)).toStrictEqual({
    status: 'refused',
    problems: [
      {
        path: 'mcp/tracker.yml',
        reason:
          'the server tracker is also in mcp/tracker.yaml, and a server has one override file',
      },
    ],
  });
});

test('it reports every file at fault, not the first', () => {
  const files = new Map([
    ['mcp/tracker.yaml', 'item_get:\n  effects: []\n'],
    ['mcp/metrics.yaml', 'x:\n  effects: [nope]\n'],
  ]);

  expect(parseMcpOverrides(files)).toMatchObject({
    status: 'refused',
    problems: [{ path: 'mcp/metrics.yaml' }, { path: 'mcp/tracker.yaml' }],
  });
});
