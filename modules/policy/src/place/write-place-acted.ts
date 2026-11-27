import { writeRecords } from '@heynixie/log';
import type { PolicyTables } from '../policy/policy-tables';
import type { PlaceContext } from './place-context';
import { placesActedCodec } from './places-acted-codec';

export interface PlaceActed {
  readonly placeID: string;
  readonly shortID: string;
  readonly callID: string;
  readonly tool: string;

  // the thread of the call
  readonly thread: string;
}

// One record for a call that an act place allowed. It makes no new definitions snapshot. The IDs of
// an address, phone or handle sit in the erasable fields, so a forget of the place takes them.
export async function writePlaceActed(
  context: Pick<PlaceContext, 'log' | 'definitions'>,
  acted: PlaceActed,
): Promise<void> {
  const row = await context.log.writer.db
    .$extendTables<PolicyTables>()
    .selectFrom('places')
    .select(['kind', 'origin'])
    .where('place_id', '=', acted.placeID)
    .executeTakeFirst();

  const isOpen = row?.origin === 'added' && (row.kind === 'site' || row.kind === 'mail_domain');
  const link = { placeID: acted.placeID, shortID: acted.shortID };
  const call = { callID: acted.callID, tool: acted.tool };

  await writeRecords(context.log, [
    isOpen
      ? {
          kind: placesActedCodec.kind,
          definitions: context.definitions(),
          thread: acted.thread,
          payload: placesActedCodec.encode({ ...link, ...call }),
        }
      : {
          kind: placesActedCodec.kind,
          definitions: context.definitions(),
          thread: acted.thread,
          payload: placesActedCodec.encode(call),
          erasable: link,
        },
  ]);
}
