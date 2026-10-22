import type { SkillToolsContext, SkillVendorContext } from '@heynixie/skills';
import { buildSkillTools, buildSkillVendorTool } from '@heynixie/skills';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';

export function buildConversationSkillTools(
  context: Omit<SkillToolsContext, 'readSkillList'>,
  vendor: SkillVendorContext | null,
): readonly ToolDefinition[] {
  const tools = buildSkillTools({
    ...context,
    readSkillList: (run, inForce) =>
      run.thread === conversationTaskID ? (inForce?.conversationSkills ?? []) : [],
  });

  return vendor === null ? tools : [...tools, buildSkillVendorTool(vendor)];
}
