import { match } from 'ts-pattern';

export interface TestImageSize {
  readonly width: number;
  readonly height: number;
}

// one red pixel, which the encode stretches to the size asked
const pixelPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

export function encodeTestImage(
  size: TestImageSize,
  format: 'png' | 'jpeg' | 'webp',
): Promise<Uint8Array> {
  const image = new Bun.Image(pixelPNG).resize(size.width, size.height, { fit: 'fill' });

  return match(format)
    .with('png', () => image.png())
    .with('jpeg', () => image.jpeg())
    .with('webp', () => image.webp())
    .exhaustive()
    .bytes();
}
