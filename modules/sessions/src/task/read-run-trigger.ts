import { readTriggerZone } from '@heynixie/connectors';
import type { TaskRun } from '@heynixie/tasks';
import { buildTriggerDetails, readRunFire } from '@heynixie/tasks';
import type { ConversationRun } from '../types';
import type { RunTrigger } from './render-run-blocks';

// The times of the fire that opened a definition's task run, in the zone of its trigger. Null for a
// task run that a message opened, whose work no fire started.
export async function readRunTrigger(
  context: Pick<ConversationRun, 'context' | 'defaultZone'>,
  run: TaskRun,
): Promise<RunTrigger | null> {
  if (run.opened.definitionID === null) {
    return null;
  }

  const found = await readRunFire(context.context, run);

  if (found === null) {
    return null;
  }

  const version =
    found.definitionHash === null
      ? null
      : await context.context.readDefinitionVersion(
          context.context.log.writer.db,
          found.definitionHash,
        );

  const zone = await readTriggerZone(
    context.context.log,
    version?.trigger ?? null,
    found.sequence,
    context.defaultZone,
  );

  return { details: buildTriggerDetails(found.fire, found.startedAt, zone), zone };
}
