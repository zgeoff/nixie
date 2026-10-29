import type { EnvelopeRecord } from '@heynixie/log';
import { z } from 'zod';

const itemMark = z.strictObject({ itemID: z.string(), isSensitive: z.boolean() });
const proposalMark = z.strictObject({ proposalID: z.string() });

export type SensitiveRecord =
  | { readonly target: 'item'; readonly itemID: string; readonly isSensitive: boolean }
  | { readonly target: 'proposal'; readonly proposalID: string };

export function parseSensitiveRecord(record: EnvelopeRecord): SensitiveRecord | null {
  if (record.kind === 'memory.sensitive_marked') {
    return { target: 'item', ...itemMark.parse(record.payload) };
  }

  if (record.kind === 'memory.proposal_sensitive_noted') {
    return { target: 'proposal', ...proposalMark.parse(record.payload) };
  }

  return null;
}
