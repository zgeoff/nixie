export class MemoryRatingError extends Error {
  override readonly name = 'MemoryRatingError';

  readonly code = 'RATING_REFUSED';
}
