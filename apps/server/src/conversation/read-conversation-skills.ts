import type { SkillLookup } from '@heynixie/connectors';
import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { loadOrPinTaskSkills } from '@heynixie/skills';
import type { ToolRun } from '@heynixie/tools';
import { readConversationSkillList } from './read-conversation-skill-list';

// The skills of the run's pinned list that the call names, or the first name the list lacks.
export async function readConversationSkills(
  log: Log,
  inForce: DefinitionsInForce | null,
  run: ToolRun,
  names: readonly string[],
): Promise<SkillLookup> {
  const pinned = await loadOrPinTaskSkills(log, {
    thread: run.thread,
    inForce,
    list: readConversationSkillList(run, inForce),
  });

  const skills = [];

  for (const name of names) {
    const found = pinned.find((skill) => skill.name === name);

    if (found === undefined) {
      return { kind: 'missing', name };
    }

    skills.push({ name, hash: found.skillHash, files: found.files });
  }

  return { kind: 'ok', skills };
}
