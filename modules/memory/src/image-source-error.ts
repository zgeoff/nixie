export class ImageSourceError extends Error {
  override readonly name = 'ImageSourceError';

  readonly code = 'IMAGE_SOURCE_REFUSED';
}
