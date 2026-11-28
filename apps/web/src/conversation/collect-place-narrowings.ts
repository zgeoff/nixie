import type { PlaceNarrowingActivity } from './build-activity';
import type { LiveRecord } from './use-live-records';

// One entry per places.narrow notice, in record order.
export function collectPlaceNarrowings(
  records: readonly LiveRecord[],
): readonly PlaceNarrowingActivity[] {
  return records.flatMap((record) => {
    const narrowed = record.placeNarrowed;

    return narrowed === undefined
      ? []
      : [
          {
            place: narrowed.place,
            isRemoved: narrowed.isRemoved,
            ...(narrowed.trust === undefined ? {} : { trust: narrowed.trust }),
          },
        ];
  });
}
