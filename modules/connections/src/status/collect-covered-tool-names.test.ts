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

test('it names only the tools whose scopes the connection lacks none of', () => {
  const ctx = setupTest();

  expect(
    collectCoveredToolNames(ctx.actions, [{ scope: 'gmail.modify', reason: 'not_granted' }]),
  ).toStrictEqual(['stub.read_file', 'stub.plain']);
});
