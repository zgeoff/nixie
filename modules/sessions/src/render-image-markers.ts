import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import { mintBlockID } from '@heynixie/wire';

// Renders a marker for each image of your message, in the order sent, so the model reads each image
// as dropped in, as it reads a dropped block of text. Each marker has a fresh random ID and the
// image's number. A forgotten message renders none, because its note says it is gone.
export function renderImageMarkers(record: LogRecord): readonly string[] {
  const images = ownerMessageCodec.tryDecodePartial(record.payload)?.images;

  if (record.erasable.status !== 'readable' || images === undefined) {
    return [];
  }

  return images.map((_image, index) => `<dropped-image id="${mintBlockID()}" n="${index + 1}"/>`);
}
