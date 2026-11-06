export type CaseRanges = { ranges: { from: number; to: number }[] } | { invalid: string[] };

// Reads ranges of case IDs such as "t120-t180,t200", each end included.
export function parseCaseRanges(spec: string): CaseRanges {
  const parts = spec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const parsed = parts.map((part) => ({ part, match: /^t(\d+)(?:-t(\d+))?$/u.exec(part) }));
  const invalid = parsed.filter((entry) => entry.match === null).map((entry) => entry.part);

  if (invalid.length > 0) {
    return { invalid };
  }

  return {
    ranges: parsed.flatMap(({ match }) =>
      match === null ? [] : [{ from: Number(match[1]), to: Number(match[2] ?? match[1]) }],
    ),
  };
}
