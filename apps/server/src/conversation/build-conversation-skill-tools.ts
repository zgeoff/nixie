import type { SkillToolsContext, SkillVendorContext } from '@heynixie/skills';
import { buildSkillTools, buildSkillVendorTool } from '@heynixie/skills';
import type { ToolDefinition } from '@heynixie/tools';
import { readConversationSkillList } from './read-conversation-skill-list';

export function buildConversationSkillTools(
  context: Omit<SkillToolsContext, 'readSkillList'>,
  vendor: SkillVendorContext | null,
): readonly ToolDefinition[] {
  const tools = buildSkillTools({
    ...context,
    readSkillList: readConversationSkillList,
  });

  return vendor === null ? tools : [...tools, buildSkillVendorTool(vendor)];
}
