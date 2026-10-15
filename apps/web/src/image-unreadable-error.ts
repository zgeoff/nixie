// The browser could not decode an image you attached, such as a HEIC photo in a browser that reads
// no HEIC, or a file that is not an image.
export class ImageUnreadableError extends Error {
  override readonly name = 'ImageUnreadableError';

  constructor(cause: unknown) {
    super('The browser could not read the image', { cause });
  }
}
