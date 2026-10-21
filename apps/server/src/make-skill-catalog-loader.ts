import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { ModelProfile } from '@heynixie/models';
import { getCLIContextWindow } from '@heynixie/models';
import type { SkillsConfig } from '@heynixie/skills';
import { loadOrPinTaskSkills, renderSkillCatalog } from '@heynixie/skills';

export interface SkillCatalogLoaderOptions {
  readonly log: Log;

  readonly readInForce: () => DefinitionsInForce | null;

  readonly profile: Pick<ModelProfile, 'model' | 'contextTokens'>;
  readonly skills: SkillsConfig;
}

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
