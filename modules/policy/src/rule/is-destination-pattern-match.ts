import { parsePlace } from '../place/parse-place';
import { isPatternMatch } from './is-pattern-match';

// A rule's destination pattern against a declared destination. Both go to lower case first, unless
// the destination parses as a handle or as nothing: those compare exactly.
export function isDestinationPatternMatch(pattern: string, destination: string): boolean {
  const parsed = parsePlace(destination);

  return parsed === null || parsed.kind === 'handle'
    ? isPatternMatch(pattern, destination)
    : isPatternMatch(pattern.toLowerCase(), destination.toLowerCase());
}
