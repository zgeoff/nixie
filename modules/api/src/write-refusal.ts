import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { identityRefusedCodec } from './identity-refused-codec';
import type { APIContext, APITables } from './types';

interface RefusedEvent {
  readonly channel: string;
  readonly externalID: string;
}

export async function writeRefusal(context: APIContext, event: RefusedEvent): Promise<boolean> {
  const refusalKey = `${event.channel}:${event.externalID}`;

  const refusedBefore = await probeRecentlyRefused(context, context.log.writer.db, refusalKey);

  if (refusedBefore) {
    return false;
  }

  return withWriteTransaction(context.log.writer, async (tx) => {
    const refused = await probeRecentlyRefused(context, tx, refusalKey);

    if (refused) {
      return false;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: identityRefusedCodec.kind,
        definitions: context.definitions(),
        payload: identityRefusedCodec.encode({
          channel: event.channel,
          externalID: event.externalID,
          refusedAt: context.clock.now(),
        }),
      },
    ]);

    return true;
  });
}

async function probeRecentlyRefused(
  context: APIContext,
  db: Kysely<unknown>,
  refusalKey: string,
): Promise<boolean> {
  const last = await db
    .$extendTables<APITables>()
    .selectFrom('refusals')
    .select('refused_at')
    .where('refusal_key', '=', refusalKey)
    .executeTakeFirst();

  return (
    last !== undefined && context.clock.now() - last.refused_at < context.settings.refusalIntervalMs
  );
}
