import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import { mintBlockID } from '@heynixie/wire';

export function renderImageMarkers(
  record: LogRecord,
  mint: () => string = mintBlockID,
): readonly string[] {
  const images = ownerMessageCodec.tryDecodePartial(record.payload)?.images;

  if (record.erasable.status !== 'readable' || images === undefined) {
    return [];
  }

  return images.map((_image, index) => `<dropped-image id="${mint()}" n="${index + 1}"/>`);
}
