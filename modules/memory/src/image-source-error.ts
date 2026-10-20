// A remember whose image source is no image of yours: a message outside the thread, a message that
// is not yours, an image the message lacks, or a message forgotten. The model reads the message as
// the tool's refusal.
export class ImageSourceError extends Error {
  override readonly name = 'ImageSourceError';

  readonly code = 'IMAGE_SOURCE_REFUSED';
}
