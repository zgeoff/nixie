import { expect, test } from 'bun:test';
import { buildToolRegistry } from '../build-tool-registry';
import { buildMockToolDefinition } from '../test-utils/build-mock-tool-definition';
import { findToolDeclaration } from './find-tool-declaration';

function setupTest() {
  const registry = buildToolRegistry([
    buildMockToolDefinition({
      name: 'jobs_start',
      declaration: { effects: ['read'] },
      variants: {
        pick: () => 'risky',
        declarations: {
          risky: {
            effects: ['note'],
            destinations: [],
            amount: null,
            content: ['query'],
            results: { text: 'owner_data' },
          },
        },
      },
    }),
  ]);

  return { registry };
}

test('it finds the declaration of a tool by its name', () => {
  const ctx = setupTest();

  expect(findToolDeclaration(ctx.registry, 'jobs_start')?.effects).toStrictEqual(['read']);
});

test('it finds the declaration of a variant by the name of its tool and itself', () => {
  const ctx = setupTest();

  expect(findToolDeclaration(ctx.registry, 'jobs_start/risky')).toStrictEqual({
    effects: ['note'],
    destinations: [],
    amount: null,
    content: ['query'],
    results: { text: 'owner_data' },
  });
});

test.each(['jobs_start/ghost', 'shell/risky', 'shell'])('it finds nothing for %s', (name) => {
  const ctx = setupTest();

  expect(findToolDeclaration(ctx.registry, name)).toBeNull();
});
