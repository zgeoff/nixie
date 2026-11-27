import { expect, test } from 'bun:test';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import type { ConnectorAction } from '../connector/types';
import { collectHeldBackToolNames } from './collect-held-back-tool-names';

function setupTest() {
  const specs: readonly (readonly [string, readonly string[]])[] = [
    ['stub.read_mail', ['gmail.modify']],
    ['stub.read_file', ['drive.file']],
    ['stub.plain', []],
    ['stub.copy_attachment', ['gmail.modify', 'drive.file']],
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
    title: 'no live connection holds nothing back',
    missing: [],
    expected: [],
  },
  {
    title: 'a connection with every scope holds nothing back',
    missing: [[]],
    expected: [],
  },
  {
    title: 'a scope the only connection lacks holds its tools back',
    missing: [[{ scope: 'drive.file', reason: 'not_granted' }]],
    expected: ['stub.read_file', 'stub.copy_attachment'],
  },
  {
    title: 'a scope that only one of two connections lacks holds nothing back',
    missing: [[{ scope: 'drive.file', reason: 'not_granted' }], []],
    expected: [],
  },
  {
    title: 'a scope that both connections lack holds its tools back',
    missing: [
      [{ scope: 'gmail.modify', reason: 'api_disabled' }],
      [
        { scope: 'drive.file', reason: 'not_granted' },
        { scope: 'gmail.modify', reason: 'not_granted' },
      ],
    ],
    expected: ['stub.read_mail', 'stub.copy_attachment'],
  },
  {
    title: 'a tool of two scopes that each of two connections lacks one of',
    missing: [
      [{ scope: 'gmail.modify', reason: 'not_granted' }],
      [{ scope: 'drive.file', reason: 'not_granted' }],
    ],
    expected: ['stub.copy_attachment'],
  },
] as const)('#collectHeldBackToolNames holds back tools when $title', (row) => {
  const ctx = setupTest();

  expect(collectHeldBackToolNames(ctx.actions, row.missing)).toStrictEqual([...row.expected]);
});
