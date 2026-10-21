import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { runSkillReload } from './run-skill-reload';
import { skillReloadOutput } from './skill-reload-output';
import type { SkillToolsContext } from './types';

const reloadArguments = z.object({ name: z.string() });

export function buildSkillReloadTool(context: SkillToolsContext): ToolDefinition {
  return {
    name: 'skill_reload',
    description:
      'Moves one of your skills to its newest version from the definitions, for the rest of this ' +
      'task, and returns its old and new version. Use it when the owner says they changed the ' +
      'skill. The catalog shows the new version from the next turn; read the skill again to load it.',
    input: {
      type: 'object',
      properties: { name: { type: 'string', description: 'the skill to move on' } },
      required: ['name'],
      additionalProperties: false,
    },
    output: skillReloadOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { skills: 'owner_data' },
    },
    execution: 'direct',
    run: (call, tool) => runSkillReload(context, tool.run, reloadArguments.parse(call.input).name),
  };
}
