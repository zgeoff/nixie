import type { Definitions, Log } from '@heynixie/log';
import type { CodingTables } from '../types';
import { writeSessionNames } from './write-session-names';

interface NamesContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

// The short ID of the coding session that each of the given tasks binds. A session that no
// listing has named yet, such as one a task just spawned, gets its short ID here. A task that binds
// no session is left out.
export async function writeTaskSessionNames(
  context: NamesContext,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (taskIDs.length === 0) {
    return new Map();
  }

  const bindings = await context.log.writer.db
    .$extendTables<CodingTables>()
    .selectFrom('coding_sessions')
    .select(['task_id', 'adapter', 'session_id'])
    .where('task_id', 'in', [...taskIDs])
    .execute();

  const adapters = [...new Set(bindings.map((binding) => binding.adapter))];

  const named = new Map<string, ReadonlyMap<string, string>>();

  for (const adapter of adapters) {
    const names = await writeSessionNames(
      context,
      adapter,
      bindings
        .filter((binding) => binding.adapter === adapter)
        .map((binding) => binding.session_id),
    );

    named.set(adapter, names);
  }

  return new Map(
    bindings.flatMap((binding) => {
      const shortID = named.get(binding.adapter)?.get(binding.session_id);

      return shortID === undefined ? [] : [[binding.task_id, shortID] as const];
    }),
  );
}
