import type { ToolDefinition } from '@heynixie/tools';
import { buildSkillReadTool } from './build-skill-read-tool';
import { buildSkillReloadAllTool } from './build-skill-reload-all-tool';
import { buildSkillReloadTool } from './build-skill-reload-tool';
import { buildSkillWriteTool } from './build-skill-write-tool';
import type { SkillToolsContext } from './types';

// Builds the skill tools a caller with a skill list gets: skill_read, skill_reload,
// skill_reload_all and skill_write.
export function buildSkillTools(context: SkillToolsContext): readonly ToolDefinition[] {
  return [
    buildSkillReadTool(context),
    buildSkillReloadTool(context),
    buildSkillReloadAllTool(context),
    buildSkillWriteTool(context),
  ];
}
