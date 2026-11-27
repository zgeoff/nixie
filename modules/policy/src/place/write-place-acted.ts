import { writeRecords } from '@heynixie/log';
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

// One record for a call that an act place allowed. It makes no new definitions snapshot.
export async function writePlaceActed(context: PlaceContext, acted: PlaceActed): Promise<void> {
  await writeRecords(context.log, [
    {
      kind: placesActedCodec.kind,
      definitions: context.definitions(),
      thread: acted.thread,
      payload: placesActedCodec.encode({
        placeID: acted.placeID,
        shortID: acted.shortID,
        callID: acted.callID,
        tool: acted.tool,
      }),
    },
  ]);
}
