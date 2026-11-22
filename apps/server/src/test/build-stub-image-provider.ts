import type { ImageProvider, ImageSize } from '@heynixie/connectors';
import { match } from 'ts-pattern';

// one red pixel and one blue pixel, which each reply stretches to the size asked
const redPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

const bluePNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQizoBAAHaAUGizqgqAAAAAElFTkSuQmCC',
  'base64',
);

// The provider of a test build, in place of each real one, so a journey draws without a key, a
// network or a charge. A new image comes back red and an edit blue, so a journey tells them apart.
export function buildStubImageProvider(): ImageProvider {
  return {
    takes: { source: true, references: true },
    draw: async (request) => {
      const dimensions = toDimensions(request.size);
      const pixel = request.source === undefined ? redPNG : bluePNG;

      const bytes = await new Bun.Image(pixel)
        .resize(dimensions.width, dimensions.height, { fit: 'fill' })
        .png()
        .bytes();

      return { kind: 'image', mediaType: 'image/png', bytes };
    },
  };
}

function toDimensions(size: ImageSize): { readonly width: number; readonly height: number } {
  return match(size)
    .with('1024x1024', () => ({ width: 1024, height: 1024 }))
    .with('1536x1024', () => ({ width: 1536, height: 1024 }))
    .with('1024x1536', () => ({ width: 1024, height: 1536 }))
    .exhaustive();
}
