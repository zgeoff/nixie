import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { Harness } from '@heynixie/models';
import type { SkillsConfig } from '@heynixie/skills';
import { loadOrPinTaskSkills, renderSkillCatalog } from '@heynixie/skills';
import invariant from 'tiny-invariant';

export interface SkillCatalogLoaderOptions {
  readonly log: Log;

  readonly readInForce: () => DefinitionsInForce | null;

  readonly harness: Pick<Harness, 'contextWindow'>;
  readonly skills: SkillsConfig;
}

export function makeSkillCatalogLoader(
  options: SkillCatalogLoaderOptions,
): (taskID: string) => Promise<string | null> {
  const window = options.harness.contextWindow;

  // Only the conversation builds a catalog, and its role needs the context-window capability.
  invariant(window !== null, 'the harness of a skill catalog reports no context window');

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
