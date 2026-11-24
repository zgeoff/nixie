import type { RecordKind } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import { nixieVersion } from '../nixie-version';

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
  // when this process started, the end of any outage
  readonly processStartedAtMs: number;

  // the gap before a start that counts as an outage
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

    const lastRecord =
      outageSettings === null
        ? undefined
        : await tx
            .$extendTables<RecordTables>()
            .selectFrom('records')
            .select('recorded_at')
            .where('recorded_at', '<', outageSettings.processStartedAtMs)
            .orderBy('sequence', 'desc')
            .limit(1)
            .executeTakeFirst();

    const outage =
      outageSettings === null
        ? null
        : pickStartOutage(lastRecord?.recorded_at ?? null, outageSettings);

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

// A type alias, because a record's payload needs the index signature that an interface lacks.
export type StartOutage = Readonly<{ downAtMs: number; upAtMs: number }>;

function pickStartOutage(
  lastRecordAtMs: number | null,
  settings: StartOutageSettings,
): StartOutage | null {
  if (
    lastRecordAtMs === null ||
    settings.processStartedAtMs - lastRecordAtMs <= settings.thresholdMs
  ) {
    return null;
  }

  return { downAtMs: lastRecordAtMs, upAtMs: settings.processStartedAtMs };
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
