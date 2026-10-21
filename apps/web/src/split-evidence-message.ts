export interface EvidenceSplit {
  readonly before: string;
  readonly quote: string;
  readonly after: string;
}

export function splitEvidenceMessage(text: string, start: number, end: number): EvidenceSplit {
  const from = Math.min(Math.max(start, 0), text.length);
  const to = Math.min(Math.max(end, from), text.length);

  return { before: text.slice(0, from), quote: text.slice(from, to), after: text.slice(to) };
}
