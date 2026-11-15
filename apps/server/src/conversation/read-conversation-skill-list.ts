import type { DefinitionsInForce } from '@heynixie/definitions';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolRun } from '@heynixie/tools';

// The skills a run's task lists. A started task's thread has no skill list.
export function readConversationSkillList(
  run: ToolRun,
  inForce: DefinitionsInForce | null,
): readonly string[] {
  return run.thread === conversationTaskID ? (inForce?.conversationSkills ?? []) : [];
}
