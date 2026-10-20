import type { RecordKind } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { z } from 'zod';
import { nixieVersion } from './nixie-version';

// What the conversation is given at a start: the names of its tools and the version of its
// persona, or null before the first seed.
export interface StartGiven {
  readonly tools: readonly string[];
  readonly personaVersion: string | null;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
type RecordTables = Readonly<{
  records: { readonly sequence: number; readonly kind: RecordKind; readonly payload: string };
}>;

const givenPayload = z.object({
  tools: z.array(z.string()),
  personaVersion: z.string().nullable(),
});

const startPayload = z.object({ version: z.string(), given: givenPayload.optional() });

// Records that nixie started, with its version, the version of the start before it, and what the
// conversation is given, with what changed in that since the start before. The first start, and a
// start after one from a release that recorded nothing given, has no changes.
export function writeStartRecord(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  given: StartGiven,
  version: string = nixieVersion,
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
        },
      },
    ]);
  });
}

// What changed in what the conversation is given since the start before: the tools added and
// removed, by name, and whether the persona changed. A type alias, because a record's payload
// needs the index signature an interface lacks.
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
