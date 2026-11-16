import type { DefinitionsContext, DefinitionsExportSweep } from '@heynixie/definitions';
import { recordSeedResult } from '../seed/record-seed-result';
import type { ServerParts } from '../types';
import { runDefinitionsSeed } from './run-definitions-seed';

// What a runtime change of a task definition takes from the server: the check of a start, the
// queued seed of the definitions source, the in-force seed it runs in its own transaction, and the
// wake of the export.
export function buildDefinitionsContext(
  parts: ServerParts,
  exports: DefinitionsExportSweep | null,
): DefinitionsContext {
  return {
    log: parts.context.log,
    checkTaskStart: parts.tasks.checkTaskStart,
    toolNames: parts.tasks.toolNames,
    runSeed: () => runDefinitionsSeed(parts),
    inForceSeed: { log: parts.context.log, buildPolicy: parts.buildPolicy },
    onSeeded: (result) => {
      recordSeedResult(parts, result);
    },
    wakeExport: () => {
      exports?.wake();
    },
  };
}
