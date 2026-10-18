import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import { buildSkillTools } from './build-skill-tools';

test('it builds skill_read, skill_reload and skill_reload_all, which the registry accepts', () => {
  const tools = buildSkillTools({
    log: { writer: null as never, deploymentKey: null as never, projections: [] },
    readInForce: () => null,
    refreshDefinitions: () => Promise.resolve(null),
    readSkillList: () => [],
  });

  const registry = buildToolRegistry(tools);

  expect(tools.map((tool) => [tool.name, tool.declaration.effects])).toStrictEqual([
    ['skill_read', ['read']],
    ['skill_reload', ['note']],
    ['skill_reload_all', ['note']],
  ]);

  expect(registry.findTool('skill_reload_all')).not.toBeNull();
});
