import type { ToolDefinition } from '@heynixie/tools';
import { buildSkillReadTool } from './build-skill-read-tool';
import { buildSkillReloadAllTool } from './build-skill-reload-all-tool';
import { buildSkillReloadTool } from './build-skill-reload-tool';
import { buildSkillWriteTool } from './build-skill-write-tool';
import type { SkillToolsContext } from './types';

export function buildSkillTools(context: SkillToolsContext): readonly ToolDefinition[] {
  return [
    buildSkillReadTool(context),
    buildSkillReloadTool(context),
    buildSkillReloadAllTool(context),
    buildSkillWriteTool(context),
  ];
}
