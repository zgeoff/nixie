import type { ToolDefinition } from '@heynixie/tools';
import { buildSkillReadTool } from './build-skill-read-tool';
import { buildSkillReloadAllTool } from './build-skill-reload-all-tool';
import { buildSkillReloadTool } from './build-skill-reload-tool';
import type { SkillToolsContext } from './types';

// Builds the skill tools a caller with a skill list gets: skill_read, skill_reload and
// skill_reload_all.
export function buildSkillTools(context: SkillToolsContext): readonly ToolDefinition[] {
  return [
    buildSkillReadTool(context),
    buildSkillReloadTool(context),
    buildSkillReloadAllTool(context),
  ];
}
