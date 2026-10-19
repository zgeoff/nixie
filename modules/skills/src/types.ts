import type { DefinitionsInForce } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import type { ToolRun } from '@heynixie/tools';

// What the skill tools reach: the log the pins live in, the definitions in force, a fresh seed, and
// each caller's skill list.
export interface SkillToolsContext {
  readonly log: Log;
  readonly readInForce: () => DefinitionsInForce | null;

  // takes a fresh snapshot, seeds it when its revision is new, and returns the definitions then in
  // force, or the last ones when the source refused the snapshot
  readonly refreshDefinitions: () => Promise<DefinitionsInForce | null>;

  // the names on the run's skill list in the given definitions
  readonly readSkillList: (run: ToolRun, inForce: DefinitionsInForce | null) => readonly string[];
}
