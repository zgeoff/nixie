import { MemoryStateError } from './memory-state-error';
import { parseEvidence } from './parse-evidence';
import type { RestoreRequest, StoreParts, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

export function writeRestoration(parts: StoreParts, request: RestoreRequest): Promise<VersionRef> {
  return writeMemoryVersion(parts, {
    requirement: { target: request.target, operation: 'restore', states: ['active', 'retired'] },
    provenance: request.provenance,
    ...(request.writeInTransaction === undefined
      ? {}
      : { writeInTransaction: request.writeInTransaction }),
    readNextVersion: async (readEarlier, current) => {
      const before = await readEarlier(current);

      const until = before.row.until;

      if (
        before.row.state === 'active' &&
        (until === null || until > parts.context.gate.clock.now())
      ) {
        throw new MemoryStateError(request.target.itemID, 'restore', 'active');
      }

      return {
        change: 'restored',
        state: 'active',
        text: { ...before.text, intentQuote: null },
        evidence: parseEvidence(before.row.evidence),
        source: before.row.source,
        intentEvidence: null,
        until: null,
      };
    },
  });
}
