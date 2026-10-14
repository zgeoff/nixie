// A rating the model cannot give: no recall to rate, or an item the thread's latest recall did not
// deliver. The message is the plain reason the model reads.
export class MemoryRatingError extends Error {
  override readonly name = 'MemoryRatingError';
  readonly code = 'RATING_REFUSED';
}
