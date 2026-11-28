import { expect, test } from 'bun:test';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import type { ConnectorAction } from '../connector/types';
import { collectCoveredToolNames } from './collect-covered-tool-names';

function setupTest() {
  const specs: readonly (readonly [string, readonly string[]])[] = [
    ['stub.read_mail', ['gmail.modify']],
    ['stub.read_file', ['drive.file']],
    ['stub.plain', []],
  ];

  return {
    actions: specs.map(([name, scopes]): ConnectorAction => ({
      tool: buildMockToolDefinition({ name }),
      scopes,
      reconcile: { kind: 'none' },
    })),
  };
}

test('it names only the tools whose scopes the connection holds', () => {
  const ctx = setupTest();

  expect(
    collectCoveredToolNames(ctx.actions, {
      granted: ['gmail.modify', 'drive.file'],
      missing: [{ scope: 'gmail.modify', reason: 'api_disabled' }],
    }),
  ).toStrictEqual(['stub.read_file', 'stub.plain']);
});

test('it leaves out a tool whose scope the last check never saw', () => {
  const ctx = setupTest();

  expect(
    collectCoveredToolNames(ctx.actions, { granted: ['gmail.modify'], missing: [] }),
  ).toStrictEqual(['stub.read_mail', 'stub.plain']);
});
