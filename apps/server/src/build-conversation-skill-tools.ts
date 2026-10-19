import type { SkillToolsContext } from '@heynixie/skills';
import { buildSkillTools } from '@heynixie/skills';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';

// Builds the skill tools the conversation's tool endpoint serves. The conversation's skill list is
// the conversation's list in the definitions in force, and every other run on the endpoint has an
// empty list, so it reads no skill.
export function buildConversationSkillTools(
  context: Omit<SkillToolsContext, 'readSkillList'>,
): readonly ToolDefinition[] {
  return buildSkillTools({
    ...context,
    readSkillList: (run, inForce) =>
      run.thread === conversationTaskID ? (inForce?.conversationSkills ?? []) : [],
  });
}
