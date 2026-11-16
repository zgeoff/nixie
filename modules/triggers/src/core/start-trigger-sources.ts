import type { JSONValue } from '@heynixie/log';
import { z } from 'zod';
import type {
  SourceHealth,
  TriggerContext,
  TriggerCoreContext,
  TriggerSource,
  TriggersTables,
} from '../types';
import { deliverTriggerBatch } from './deliver-trigger-batch';

export interface TriggerSources {
  readonly stop: () => Promise<void>;
  readonly readHealth: () => ReadonlyMap<string, SourceHealth>;
}

// Starts each source with a context that delivers under the source's ID and holds the cursor that
// nixie last committed for it.
export async function startTriggerSources(
  sources: readonly TriggerSource[],
  core: TriggerCoreContext,
): Promise<TriggerSources> {
  const health = new Map<string, SourceHealth>();

  const controllers: AbortController[] = [];
  const started: TriggerSource[] = [];

  for (const source of sources) {
    const controller = new AbortController();

    controllers.push(controller);

    try {
      await source.start({
        cursor: await readCursor(core, source.id),
        deliver: (batch) => deliverTriggerBatch(core, source.id, batch),
        reportHealth: (next) => {
          if (health.get(source.id) !== next) {
            health.set(source.id, next);
            core.logEvent('trigger_source.health', { source: source.id, health: next });
          }
        },
        signal: controller.signal,
      } satisfies TriggerContext);
    } catch (error) {
      await stopSources(controllers, started);

      throw error;
    }

    started.push(source);
  }

  return {
    stop: async () => {
      const failures = await stopSources(controllers, started);

      if (failures.length > 0) {
        throw new AggregateError(failures, 'trigger sources failed to stop');
      }
    },
    readHealth: () => new Map(health),
  };
}

async function readCursor(core: TriggerCoreContext, sourceID: string): Promise<JSONValue> {
  const row = await core.log.writer.db
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_sources')
    .select('cursor')
    .where('source_id', '=', sourceID)
    .executeTakeFirst();

  return row?.cursor === undefined || row.cursor === null
    ? null
    : z.json().parse(JSON.parse(row.cursor));
}

// Aborts every signal, then stops every started source even when one stop rejects.
async function stopSources(
  controllers: readonly AbortController[],
  started: readonly TriggerSource[],
): Promise<unknown[]> {
  for (const controller of controllers) {
    controller.abort();
  }

  const results = await Promise.allSettled(started.map((source) => source.stop()));

  const failures: unknown[] = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      const reason: unknown = result.reason;

      failures.push(reason);
    }
  }

  return failures;
}
