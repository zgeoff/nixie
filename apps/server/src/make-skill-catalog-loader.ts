import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { ModelProfile } from '@heynixie/models';
import { getCLIContextWindow } from '@heynixie/models';
import type { SkillsConfig } from '@heynixie/skills';
import { loadOrPinTaskSkills, renderSkillCatalog } from '@heynixie/skills';

export interface SkillCatalogLoaderOptions {
  readonly log: Log;

  // the definitions in force, whose conversation list a task's first read pins
  readonly readInForce: () => DefinitionsInForce | null;

  // the conversation's profile, whose context window the catalog's cap is a share of
  readonly profile: Pick<ModelProfile, 'model' | 'contextTokens'>;
  readonly skills: SkillsConfig;
}

// Makes the loader of the conversation's skill catalog before each step: the skills the task is
// pinned to, within its share of the context window the conversation's CLI works in. A task's first
// load writes its pin from the definitions in force.
export function makeSkillCatalogLoader(
  options: SkillCatalogLoaderOptions,
): (taskID: string) => Promise<string | null> {
  const window = options.profile.contextTokens ?? getCLIContextWindow(options.profile.model);
  const capTokens = Math.floor(window * options.skills.catalogShare);

  return async (taskID) => {
    const inForce = options.readInForce();

    const skills = await loadOrPinTaskSkills(options.log, {
      thread: taskID,
      inForce,
      list: inForce?.conversationSkills ?? [],
    });

    return renderSkillCatalog(skills, capTokens).text;
  };
}
