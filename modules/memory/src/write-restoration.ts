import { parseEvidence } from './parse-evidence';
import type { RestoreRequest, StoreParts, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

// Adds a version that makes a retired item active again with the text it had.
export function writeRestoration(parts: StoreParts, request: RestoreRequest): Promise<VersionRef> {
  return writeMemoryVersion(parts, {
    requirement: { target: request.target, operation: 'restore', states: ['retired'] },
    provenance: request.provenance,
    ...(request.writeInTransaction === undefined
      ? {}
      : { writeInTransaction: request.writeInTransaction }),
    buildVersion: async (readEarlier, current) => {
      const before = await readEarlier(current);

      return {
        change: 'restored',
        state: 'active',
        text: { ...before.text, intentQuote: null },
        evidence: parseEvidence(before.row.evidence),
        source: before.row.source,
        intentEvidence: null,
      };
    },
  });
}
