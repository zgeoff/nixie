import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import { placesNarrowedCodec } from '@heynixie/policy';

// The notice of a places.narrow call, with the place's key or short ID from the lookup. A removal
// holds no level.
export function toPlaceNarrowed(
  record: LogRecord,
  place: string | undefined,
): NonNullable<ContractRecord['placeNarrowed']> | undefined {
  const narrowed = placesNarrowedCodec.tryDecodePartial(record.payload);

  return place === undefined || narrowed === null
    ? undefined
    : {
        place,
        ...(narrowed.trust === undefined ? {} : { trust: narrowed.trust }),
        isRemoved: narrowed.trust === undefined,
      };
}
