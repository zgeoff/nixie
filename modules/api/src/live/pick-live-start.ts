interface LiveStarts {
  readonly afterSequence: number | undefined;
  readonly lastEventID: string | undefined;
  readonly head: number;
}

// The sequence a page stream starts after: the last event ID when it is a sequence of 1 to 15
// digits, otherwise the input's afterSequence, otherwise the head. A start past the head would skip
// the record that revokes the caller, so the start never passes the head.
export function pickLiveStart(starts: LiveStarts): number {
  const resumed =
    starts.lastEventID !== undefined && /^\d{1,15}$/u.test(starts.lastEventID)
      ? Number(starts.lastEventID)
      : starts.afterSequence;

  return Math.min(resumed ?? starts.head, starts.head);
}
