import { parseEvidence } from './parse-evidence';
import type { RetireRequest } from './types';
import type { VersionPlan } from './write-version-in-transaction';

export function planRetiredVersion(request: RetireRequest): VersionPlan {
  return {
    requirement: { target: request.target, operation: 'retire', states: ['active'] },
    provenance: request.provenance,
    ...(request.writeInTransaction === undefined
      ? {}
      : { writeInTransaction: request.writeInTransaction }),
    readNextVersion: async (readEarlier, current) => {
      const before = await readEarlier(current);

      return {
        change: 'retired',
        state: 'retired',
        text: { ...before.text, intentQuote: request.intentQuote ?? null },
        evidence: parseEvidence(before.row.evidence),
        source: before.row.source,
        intentEvidence: request.intentEvidence ?? null,
        until: before.row.until,
      };
    },
  };
}
