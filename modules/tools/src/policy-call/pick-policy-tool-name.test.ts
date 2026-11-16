import { expect, test } from 'bun:test';
import { buildToolRegistry } from '../build-tool-registry';
import { buildMockToolDefinition } from '../test-utils/build-mock-tool-definition';
import { buildMockVariantToolDefinition } from '../test-utils/build-mock-variant-tool-definition';
import { pickPolicyToolName } from './pick-policy-tool-name';

function setupTest() {
  return {
    registry: buildToolRegistry([
      buildMockVariantToolDefinition(),
      buildMockToolDefinition({ name: 'notes_read' }),
    ]),
  };
}

test.each([
  ['jobs_start', { kind: 'risky', query: 'a' }, 'jobs_start/risky'],
  ['jobs_start', { kind: 'plain', query: 'a' }, 'jobs_start/plain'],
  ['notes_read', {}, 'notes_read'],
  ['ghost', {}, 'ghost'],
])('it names a call of %s with input %j as %s', (tool, input, expected) => {
  const ctx = setupTest();

  expect(pickPolicyToolName(ctx.registry, tool, input)).toBe(expected);
});

test('it names a call by its tool when the picked variant is not declared', () => {
  const registry = buildToolRegistry([
    buildMockVariantToolDefinition({ variants: { pick: () => 'ghost', declarations: {} } }),
  ]);

  expect(pickPolicyToolName(registry, 'jobs_start', {})).toBe('jobs_start');
});
