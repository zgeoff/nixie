import { readLiveAddressRefs } from '@heynixie/connections';
import type { SeedResult } from '@heynixie/definitions';
import { runInForceSeed, runSeed } from '@heynixie/definitions';
import { writeOwnPlaces, writePersonalRemovals } from '@heynixie/policy';
import { readArmedReminders } from '@heynixie/reminders';
import { listOwnPlaceSources } from '../place/list-own-place-sources';
import type { SeedParts } from '../seed/run-queued-seed';
import { runQueuedSeed } from '../seed/run-queued-seed';

export function runDefinitionsSeed(parts: SeedParts): Promise<SeedResult> {
  return runQueuedSeed(parts, async () => {
    await writePersonalRemovals(parts.context.log);

    const result = await runSeed({
      log: parts.context.log,
      onRuleWarning: (warning) => {
        parts.log('definitions.rule_field_unknown', { ...warning }, 'warn');
      },
      onRetiredPromptKey: (key) => {
        parts.log('definitions.prompt_key_retired', { key }, 'warn');
      },
      onTaskWarning: (warning) => {
        const event =
          warning.kind === 'field_unknown'
            ? 'definitions.task_skipped'
            : 'definitions.task_tool_dropped';

        parts.log(event, { ...warning }, 'warn');
      },
      onSectionProblem: (problem) => {
        parts.log(problem.event, { path: problem.path, reason: problem.reason }, 'warn');
      },
      source: parts.source,
      tasks: parts.tasks,
      buildPolicy: parts.buildPolicy,
      builtInBudgets: parts.context.budgets?.builtIn() ?? [],
      readExtraArmed: readArmedReminders,
      readSelfPlaces: readLiveAddressRefs,
    });

    const final = result.status === 'refused' ? result : await runOwnPlacesSeed(parts, result);

    parts.state.update({
      definitions:
        final.status === 'refused'
          ? { isReady: false, reason: `the last snapshot was refused: ${final.error.name}` }
          : { isReady: true, reason: null },
    });

    return final;
  });
}

// Adds nixie's own places under the snapshot that the seed just put in force, since each record
// names a snapshot and a first start has none before its seed. When it adds any, it runs the
// in-force seed again, so the snapshot's directory holds them.
async function runOwnPlacesSeed(parts: SeedParts, result: SeedResult): Promise<SeedResult> {
  const snapshotHash = result.inForce?.snapshotHash;

  if (snapshotHash === undefined) {
    return result;
  }

  const added = await writeOwnPlaces(
    { log: parts.context.log, definitions: () => ({ snapshotHash }) },
    listOwnPlaceSources(parts.config),
  );

  if (added === 0) {
    return result;
  }

  return runInForceSeed({
    log: parts.context.log,
    buildPolicy: parts.buildPolicy,
    builtInBudgets: parts.context.budgets?.builtIn() ?? [],
    readExtraArmed: readArmedReminders,
    readSelfPlaces: readLiveAddressRefs,
  });
}
