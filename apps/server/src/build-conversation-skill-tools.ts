import type { SkillToolsContext } from '@heynixie/skills';
import { buildSkillTools } from '@heynixie/skills';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';

export function buildConversationSkillTools(
  context: Omit<SkillToolsContext, 'readSkillList'>,
): readonly ToolDefinition[] {
  return buildSkillTools({
    ...context,
    readSkillList: (run, inForce) =>
      run.thread === conversationTaskID ? (inForce?.conversationSkills ?? []) : [],
  });
}
