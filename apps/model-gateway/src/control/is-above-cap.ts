import type { Measures } from '../types';

export function isAboveCap(limit: Measures, cap: Measures): boolean {
  return limit.dollars > cap.dollars || limit.tokens > cap.tokens;
}
