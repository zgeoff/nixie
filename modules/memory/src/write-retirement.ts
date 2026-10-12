import { parseEvidence } from './parse-evidence';
import type { RetireRequest, StoreParts, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

// Adds a version that retires an active item. The text stays as it was, and the version carries
// your request to retire it when one exists.
export function writeRetirement(parts: StoreParts, request: RetireRequest): Promise<VersionRef> {
  return writeMemoryVersion(parts, {
    requirement: { target: request.target, operation: 'retire', states: ['active'] },
    provenance: request.provenance,
    buildVersion: async (readEarlier, current) => {
      const before = await readEarlier(current);

      return {
        change: 'retired',
        state: 'retired',
        text: { ...before.text, intentQuote: request.intentQuote ?? null },
        evidence: parseEvidence(before.row.evidence),
        source: before.row.source,
        intentEvidence: request.intentEvidence ?? null,
      };
    },
  });
}
