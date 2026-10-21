type RatingVerdict = 'helpful' | 'noise' | 'misleading';

export interface MemoryRating {
  readonly item: string;
  readonly verdict: RatingVerdict;
  readonly note?: string | undefined;
}

export interface RateRequest {
  readonly thread: string;
  readonly runID: string;

  readonly ratedBy: string | null;
  readonly ratings: readonly MemoryRating[];
}
