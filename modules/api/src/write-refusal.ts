import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { APIContext, APITables } from './types';

interface RefusedEvent {
  readonly channel: string;
  readonly externalID: string;
}

// Writes a refusal record for an event that resolved to nobody, with its channel, external ID and
// time and none of its content, at most one per external ID an hour by default, so a stranger who
// keeps calling cannot fill the log. Returns whether it wrote one.
export function writeRefusal(context: APIContext, event: RefusedEvent): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();
    const last = await tx
      .$extendTables<APITables>()
      .selectFrom('refusals')
      .select('refused_at')
      .where('refusal_key', '=', `${event.channel}:${event.externalID}`)
      .executeTakeFirst();

    if (last !== undefined && now - last.refused_at < context.settings.refusalIntervalMs) {
      return false;
    }
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'identity.refused',
        definitions: context.definitions(),
        payload: { channel: event.channel, externalID: event.externalID, refusedAt: now },
      },
    ]);
    return true;
  });
}
