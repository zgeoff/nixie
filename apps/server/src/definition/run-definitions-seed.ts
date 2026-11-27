import { readLiveConnectionIDs } from '@heynixie/connections';
import type { SeedResult } from '@heynixie/definitions';
import { runSeed } from '@heynixie/definitions';
import { writeContactKinds, writeOwnPlaces } from '@heynixie/policy';
import { readArmedReminders } from '@heynixie/reminders';
import { listOwnPlaceSources } from '../place/list-own-place-sources';
import type { SeedParts } from '../seed/run-queued-seed';
import { runQueuedSeed } from '../seed/run-queued-seed';

export function runDefinitionsSeed(parts: SeedParts): Promise<SeedResult> {
  return runQueuedSeed(parts, async () => {
    await writeContactKinds(parts.context.log);

    await writeOwnPlaces(
      { log: parts.context.log, definitions: parts.context.definitions },
      listOwnPlaceSources(),
    );

    const result = await runSeed({
      log: parts.context.log,
      onRuleWarning: (warning) => {
        parts.log('definitions.rule_field_unknown', { ...warning }, 'warn');
      },
      onTaskWarning: (warning) => {
        const event =
          warning.kind === 'field_unknown'
            ? 'definitions.task_skipped'
            : 'definitions.task_tool_dropped';

        parts.log(event, { ...warning }, 'warn');
      },
      onVoiceProblem: (problem) => {
        parts.log('definitions.voice_file_skipped', { ...problem }, 'warn');
      },
      source: parts.source,
      tasks: parts.tasks,
      buildPolicy: parts.buildPolicy,
      builtInBudgets: parts.context.budgets?.builtIn() ?? [],
      readExtraArmed: readArmedReminders,
      readSelfPlaces: readLiveConnectionIDs,
    });

    parts.state.update({
      definitions:
        result.status === 'refused'
          ? { isReady: false, reason: `the last snapshot was refused: ${result.error.name}` }
          : { isReady: true, reason: null },
    });

    return result;
  });
}
