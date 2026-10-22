import { parseEvidence } from './parse-evidence';
import type { StoreParts, UndoRequest, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

export function writeUndo(parts: StoreParts, request: UndoRequest): Promise<VersionRef> {
  return writeMemoryVersion(parts, {
    requirement: { target: request.target, operation: 'undo', states: ['active', 'retired'] },
    provenance: request.provenance,
    ...(request.writeInTransaction === undefined
      ? {}
      : { writeInTransaction: request.writeInTransaction }),
    readNextVersion: async (readEarlier, current) => {
      const earlier = await readEarlier(Math.max(current - 1, 1));

      return {
        change: 'undone',
        state: current === 1 ? 'retired' : earlier.row.state,
        text: earlier.text,
        evidence: parseEvidence(earlier.row.evidence),
        source: earlier.row.source,
        intentEvidence: parseEvidence(earlier.row.intent_evidence),
      };
    },
  });
}
