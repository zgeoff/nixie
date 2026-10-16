// A message split around the quote a memory version came from.
export interface EvidenceSplit {
  readonly before: string;
  readonly quote: string;
  readonly after: string;
}

// Splits a message at the offsets of a version's quote, in UTF-16 code units as the server counts
// them, so the view shows the quote inside the words around it. Offsets past the message's end
// stop at its end.
export function splitEvidenceMessage(text: string, start: number, end: number): EvidenceSplit {
  const from = Math.min(Math.max(start, 0), text.length);
  const to = Math.min(Math.max(end, from), text.length);

  return { before: text.slice(0, from), quote: text.slice(from, to), after: text.slice(to) };
}
