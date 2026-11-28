import type { ErasableFields } from '../types';
import type { ExportTextStatus, ForgetCoverage } from './types';

export interface TextStatusSubject {
  readonly erasable: ErasableFields;
  readonly keyID: string | null;
  readonly thread: string | null;
}

// A key that is gone belongs to a forget when an erasure named it, its family or its thread, and
// to retention otherwise.
export function pickTextStatus(
  subject: TextStatusSubject,
  coverage: ForgetCoverage,
): ExportTextStatus {
  if (subject.erasable.status !== 'shredded') {
    return subject.erasable.status;
  }

  const keyID = subject.keyID;

  const isForgotten =
    (keyID !== null &&
      (coverage.keyIDs.has(keyID) ||
        coverage.families.some((family) => keyID === family || keyID.startsWith(`${family}/`)))) ||
    (subject.thread !== null && coverage.threads.has(subject.thread));

  return isForgotten ? 'shredded' : 'expired';
}
