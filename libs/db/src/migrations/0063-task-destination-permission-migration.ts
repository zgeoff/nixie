import { sql } from 'kysely';
import { z } from 'zod';
import { withTriggersDropped } from '../database/with-triggers-dropped';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

// A parse with named keys moves them ahead of the others, which would reorder a stored decision.
// Each value is parsed as a plain record instead, and only the permissions are replaced.
const recordSchema = z.record(z.string(), z.unknown());

// A stored decision names the permission of a destination as `task` in place of `job`. The release
// before parses every decision with a schema that lacks `task`, and no expand step rewrites
// append-only rows, so the oldest reader rises to this migration.
export const taskDestinationPermissionMigration: Migration = {
  name: 'store the destination permission job as task',
  up: async (tx) => {
    await withTriggersDropped(tx, async () => {
      const rows = await readQueryRows(
        sql`select sequence, decision from records where decision like ${'%"job"%'}`,
        tx,
        z.object({ sequence: z.number(), decision: z.string() }),
      );

      for (const row of rows) {
        const decision = recordSchema.safeParse(JSON.parse(row.decision));

        if (!decision.success) {
          continue;
        }

        const rewritten = buildRewrittenDecision(decision.data);

        if (rewritten !== null) {
          await sql`update records set decision = ${JSON.stringify(rewritten)}
            where sequence = ${row.sequence}`.execute(tx);
        }
      }
    });
  },
};

// The decision with each permission `job` moved to `task`, or null when it holds none. The
// `permissions` list is the current shape, and `destinations` is the shape of the first release.
function buildRewrittenDecision(
  decision: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const permissions = z.array(z.unknown()).safeParse(decision['permissions']);
  const destinations = z.array(z.unknown()).safeParse(decision['destinations']);
  const hasJobPermission = permissions.success && permissions.data.includes('job');

  const hasJobDestination =
    destinations.success &&
    destinations.data.some((entry) => recordSchema.safeParse(entry).data?.['permission'] === 'job');

  if (!hasJobPermission && !hasJobDestination) {
    return null;
  }

  return {
    ...decision,
    ...(permissions.success
      ? { permissions: permissions.data.map((value) => toNewPermission(value)) }
      : {}),
    ...(destinations.success
      ? { destinations: destinations.data.map((entry) => toNewDestination(entry)) }
      : {}),
  };
}

function toNewPermission(value: unknown): unknown {
  return value === 'job' ? 'task' : value;
}

function toNewDestination(entry: unknown): unknown {
  const destination = recordSchema.safeParse(entry);

  if (!destination.success || destination.data['permission'] !== 'job') {
    return entry;
  }

  return { ...destination.data, permission: 'task' };
}
