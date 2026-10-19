import type { ToolDefinition } from '@heynixie/tools';
import { runSkillReload } from './run-skill-reload';
import { skillReloadOutput } from './skill-reload-output';
import type { SkillToolsContext } from './types';

// Builds skill_reload_all, which declares note and moves every skill of the running task to the
// versions in the definitions in force, after a fresh seed. The record holds each old and new hash.
export function buildSkillReloadAllTool(context: SkillToolsContext): ToolDefinition {
  return {
    name: 'skill_reload_all',
    description:
      'Moves all of your skills to their newest versions from the definitions, for the rest of ' +
      'this task, and returns the old and new version of each. A skill added to your list joins, ' +
      'and one removed leaves. The catalog shows the change from the next turn.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: skillReloadOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { skills: 'owner_data' },
    },
    execution: 'direct',
    run: (_call, tool) => runSkillReload(context, tool.run, null),
  };
}
