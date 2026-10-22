import type { RememberRequest } from './types';
import type { VersionPlan } from './write-version-in-transaction';

export function planRememberedVersion(request: RememberRequest): VersionPlan {
  const text = {
    text: request.text,
    evidenceQuote: request.evidenceQuote ?? null,
    intentQuote: null,
  };

  const evidence = request.evidence ?? null;
  const pin = request.isPinned === undefined ? {} : { isPinned: request.isPinned };

  if (request.target === undefined) {
    return {
      requirement: null,
      provenance: request.provenance,
      readNextVersion: () =>
        Promise.resolve({
          change: 'created',
          state: 'active',
          text,
          evidence,
          intentEvidence: null,
          until: request.until ?? null,
        }),
      ...pin,
      ...(request.subject === undefined ? {} : { subject: request.subject }),
    };
  }

  return {
    requirement: { target: request.target, operation: 'edit', states: ['active', 'retired'] },
    provenance: request.provenance,
    readNextVersion: async (readEarlier, current) => {
      const before = await readEarlier(current);

      return {
        change: 'edited',
        state: before.row.state,
        text,
        evidence,
        intentEvidence: null,
        until: request.until === undefined ? before.row.until : request.until,
      };
    },
    ...pin,
  };
}
