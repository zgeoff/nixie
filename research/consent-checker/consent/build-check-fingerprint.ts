import { createHash } from 'node:crypto';
import { renderCheckerInput } from './render-checker-input.ts';
import type { ConsentCase } from './types.ts';

// A rebuild of the cases can keep a case's ID and change its messages or its call, so a saved verdict
// counts only while the input it judged is the input the case gives now.
export function buildCheckFingerprint(consentCase: ConsentCase): string {
  return createHash('sha256').update(renderCheckerInput(consentCase)).digest('hex');
}
