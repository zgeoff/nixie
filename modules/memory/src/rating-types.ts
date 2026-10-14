// How a recalled item worked for the model on its turn.
type RatingVerdict = 'helpful' | 'noise' | 'misleading';

// One rating, of an item by the ID the model read, with an optional one-line note.
export interface MemoryRating {
  readonly item: string;
  readonly verdict: RatingVerdict;
  readonly note?: string | undefined;
}

export interface RateRequest {
  // the thread whose latest recall the ratings bind to
  readonly thread: string;
  readonly runID: string;

  // the agent's name the owner sees beside each rating, or null when the config names none
  readonly ratedBy: string | null;
  readonly ratings: readonly MemoryRating[];
}
