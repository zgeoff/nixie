export class ImageUnreadableError extends Error {
  override readonly name = 'ImageUnreadableError';

  constructor(cause: unknown) {
    super('The browser could not read the image', { cause });
  }
}
