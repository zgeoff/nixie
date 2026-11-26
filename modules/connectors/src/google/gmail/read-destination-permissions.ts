import type { DestinationPermission, Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';

const erasableSchema = z.object({
  destinations: z.object({ value: z.string() }).array().default([]),
});

// The permission that the decision gave each destination of a call, by address: null where none
// covered it. A call whose record was erased, or that has no record of its permissions, answers an
// empty map, so the card then names no permission at all.
export async function readDestinationPermissions(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  callSequence: number,
): Promise<ReadonlyMap<string, DestinationPermission | null>> {
  const [entry] = await readRecords(log, { afterSequence: callSequence - 1, limit: 1 });

  const record = entry?.record.sequence === callSequence ? entry.record : undefined;

  if (record === undefined || record.erasable.status !== 'readable') {
    return new Map();
  }

  const permissions = record.decision?.permissions ?? [];
  const fields = erasableSchema.safeParse(record.erasable.fields);

  return new Map(
    (fields.success ? fields.data.destinations : []).flatMap((destination, index) =>
      index < permissions.length ? [[destination.value, permissions[index] ?? null] as const] : [],
    ),
  );
}
