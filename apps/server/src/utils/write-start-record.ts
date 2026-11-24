import type { RecordKind, WriteTransaction } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import { nixieVersion } from '../nixie-version';
import type { StartOutage } from '../types';

export interface StartGiven {
  readonly tools: readonly string[];
  readonly personaVersion: string | null;
}

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
type RecordTables = Readonly<{
  records: {
    readonly sequence: number;
    readonly recorded_at: number;
    readonly kind: RecordKind;
    readonly payload: string;
  };
}>;

const givenPayload = z.object({
  tools: z.array(z.string()),
  personaVersion: z.string().nullable(),
});

const startPayload = z.object({ version: z.string(), given: givenPayload.optional() });

export interface StartOutageSettings {
  readonly processStartedAtMs: number;
  readonly lastAliveAtMs: number | null;
  readonly thresholdMs: number;
}

export function writeStartRecord(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  given: StartGiven,
  version: string = nixieVersion,
  outageSettings: StartOutageSettings | null = null,
): Promise<void> {
  const log = context.log;

  return withWriteTransaction(log.writer, async (tx) => {
    const previous = await tx
      .$extendTables<RecordTables>()
      .selectFrom('records')
      .select('payload')
      .where('kind', '=', 'server.started')
      .orderBy('sequence', 'desc')
      .limit(1)
      .executeTakeFirst();

    const span = outageSettings === null ? null : pickStartOutage(outageSettings);

    const outage =
      span === null ? null : { ...span, downSequence: await readDownSequence(tx, span.downAtMs) };

    const payload: unknown = previous === undefined ? null : JSON.parse(previous.payload);
    const parsed = startPayload.safeParse(payload);
    const tools = [...new Set(given.tools)].toSorted();
    const previousGiven = parsed.data?.given;

    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'server.started',
        definitions: context.definitions(),
        payload: {
          version,
          previousVersion: parsed.data?.version ?? null,
          given: { tools, personaVersion: given.personaVersion },
          changes:
            previousGiven === undefined
              ? null
              : buildStartChanges(previousGiven, { tools, personaVersion: given.personaVersion }),
          ...(outage === null ? {} : { outage }),
        },
      },
    ]);
  });
}

function pickStartOutage(
  settings: StartOutageSettings,
): Pick<StartOutage, 'downAtMs' | 'upAtMs'> | null {
  if (
    settings.lastAliveAtMs === null ||
    settings.processStartedAtMs - settings.lastAliveAtMs <= settings.thresholdMs
  ) {
    return null;
  }

  return { downAtMs: settings.lastAliveAtMs, upAtMs: settings.processStartedAtMs };
}

async function readDownSequence(tx: WriteTransaction, downAtMs: number): Promise<number> {
  const last = await tx
    .$extendTables<RecordTables>()
    .selectFrom('records')
    .select('sequence')
    .where('recorded_at', '<=', downAtMs)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return last?.sequence ?? 0;
}

// A type alias, because a record's payload needs the index signature that an interface lacks.
export type StartChanges = Readonly<{
  addedTools: readonly string[];
  removedTools: readonly string[];
  isPersonaUpdated: boolean;
}>;

function buildStartChanges(previous: StartGiven, current: StartGiven): StartChanges {
  const before = new Set(previous.tools);
  const after = new Set(current.tools);

  return {
    addedTools: current.tools.filter((tool) => !before.has(tool)),
    removedTools: previous.tools.filter((tool) => !after.has(tool)).toSorted(),
    isPersonaUpdated: previous.personaVersion !== current.personaVersion,
  };
}
