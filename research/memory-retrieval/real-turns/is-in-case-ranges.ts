export function isInCaseRanges(caseID: string, ranges: { from: number; to: number }[]): boolean {
  const sequence = Number(caseID.slice(1));

  return ranges.some((range) => sequence >= range.from && sequence <= range.to);
}
