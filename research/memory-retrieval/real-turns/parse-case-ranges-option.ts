import { parseCaseRanges } from './parse-case-ranges.ts';

// A bad range in a command option stops the command, so it throws rather than returning the parts.
export function parseCaseRangesOption(spec: string | undefined): { from: number; to: number }[] {
  const parsed = parseCaseRanges(spec ?? '');

  if ('invalid' in parsed) {
    throw new Error(`pass case ranges such as t120-t180,t200, not ${parsed.invalid.join(', ')}`);
  }

  return parsed.ranges;
}
