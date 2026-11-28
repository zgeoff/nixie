import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import { placesActedCodec } from '@heynixie/policy';

// The notice of a call that an act place allowed, with the place's key from the lookup. A place
// whose key a forget took has no key, so it has no notice.
export function toPlaceActed(
  record: LogRecord,
  place: string | undefined,
): NonNullable<ContractRecord['placeActed']> | undefined {
  const acted = placesActedCodec.tryDecodePartial(record.payload);

  return place === undefined || typeof acted?.tool !== 'string'
    ? undefined
    : { place, tool: acted.tool };
}
