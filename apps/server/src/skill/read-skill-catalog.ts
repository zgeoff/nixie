import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { SkillsConfig } from '@heynixie/skills';
import { loadOrPinTaskSkills, renderSkillCatalog } from '@heynixie/skills';

export interface SkillCatalogQuery {
  readonly thread: string;

  // the names a job run or a worker run may use
  readonly list: readonly string[];

  // null when the harness reports none, which leaves the catalog whole
  readonly contextWindow: number | null;
}

export interface SkillCatalogReader {
  readonly log: Log;
  readonly readInForce: () => DefinitionsInForce | null;
  readonly skills: SkillsConfig;
}

// The catalog of a run whose list is its own: the skills on the list that the thread pinned.
export async function readSkillCatalog(
  reader: SkillCatalogReader,
  query: SkillCatalogQuery,
): Promise<string | null> {
  const skills = await loadOrPinTaskSkills(reader.log, {
    thread: query.thread,
    inForce: reader.readInForce(),
    list: query.list,
    isRestricted: true,
  });

  const capTokens =
    query.contextWindow === null
      ? Number.POSITIVE_INFINITY
      : Math.floor(query.contextWindow * reader.skills.catalogShare);

  return renderSkillCatalog(skills, capTokens).text;
}
