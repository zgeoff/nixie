import { expect, test } from 'bun:test';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import type { ConnectorAction } from '../connector/types';
import { collectToolConnections } from './collect-tool-connections';

function setupTest() {
  const specs: readonly (readonly [string, readonly string[]])[] = [
    ['stub.read_mail', ['gmail.modify']],
    ['stub.read_file', ['drive.file']],
    ['stub.plain', []],
  ];

  const actions = specs.map(([name, scopes]): ConnectorAction => ({
    tool: buildMockToolDefinition({ name }),
    scopes,
    reconcile: { kind: 'none' },
  }));

  return {
    actions,
    mailOnly: {
      connection: 'k3x9m2p7qa',
      missing: [{ scope: 'drive.file', reason: 'not_granted' }],
    },
    driveOnly: {
      connection: 'p8d2v6n4rc',
      missing: [{ scope: 'gmail.modify', reason: 'not_granted' }],
    },
  } as const;
}

test('it lists for each tool only the connections that lack none of its scopes', () => {
  const ctx = setupTest();

  expect(collectToolConnections(ctx.actions, [ctx.mailOnly, ctx.driveOnly])).toStrictEqual({
    'stub.read_mail': ['k3x9m2p7qa'],
    'stub.read_file': ['p8d2v6n4rc'],
    'stub.plain': ['k3x9m2p7qa', 'p8d2v6n4rc'],
  });
});

test('it maps each tool to no connection when none is left', () => {
  const ctx = setupTest();

  expect(collectToolConnections(ctx.actions, [])).toStrictEqual({
    'stub.read_mail': [],
    'stub.read_file': [],
    'stub.plain': [],
  });
});
