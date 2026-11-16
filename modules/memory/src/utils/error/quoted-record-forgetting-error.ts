export class QuotedRecordForgettingError extends Error {
  override readonly name = 'QuotedRecordForgettingError';

  readonly code = 'QUOTED_RECORD_FORGETTING';

  constructor(recordSequence: number) {
    super(
      `the message at sequence ${String(recordSequence)} was removed, so a quote of it cannot back this write. Write it again with no quote`,
    );
  }
}
