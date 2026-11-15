interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly source: string;
}

export interface SourceMessage {
  readonly sequence: number;
  readonly text: string;
  readonly spans: readonly SourceSpan[];
  readonly sentAt: number;

  readonly timeZone: string | null;
}
