import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';

const selfNoted = z.strictObject({ itemID: z.string() });
const proposalSelfNoted = z.strictObject({ proposalID: z.string() });

// A record that marks an item or a proposal as a self-note. The mark is a record of its own
// because the release before reads a version or a proposal record as a strict shape and fails a
// rebuild on one more key, and it skips a record of a kind it does not know.
export type KindRecord =
  | { readonly kind: 'memory.self_noted'; readonly itemID: string }
  | { readonly kind: 'memory.proposal_self_noted'; readonly proposalID: string };

// Reads a kind record's payload into its typed shape, or null for a record of another kind. A kind
// record whose payload breaks its shape throws, so a fold never writes a half-read row.
export function parseKindRecord(record: EnvelopeRecord): KindRecord | null {
  if (record.kind === 'memory.self_noted') {
    return { kind: record.kind, ...selfNoted.parse(record.payload) };
  }

  if (record.kind === 'memory.proposal_self_noted') {
    return { kind: record.kind, ...proposalSelfNoted.parse(record.payload) };
  }

  return null;
}
