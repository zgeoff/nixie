import type { ProviderSentText, TextRequest } from '../types';

export type SendSettlementPick =
  | { readonly kind: 'claim'; readonly messageID: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'inconclusive' };

export interface SendEvidence {
  readonly request: TextRequest;

  // epoch ms when the attempt began
  readonly attemptStartedAt: number;

  // the provider's texts that match the send's number and body
  readonly candidates: readonly ProviderSentText[];

  // the message IDs that other sends settled on
  readonly claimedMessageIDs: readonly string[];

  // the sends that have begun and not settled, other than this one
  readonly open: readonly TextRequest[];
}

// Claims a message only when exactly one candidate has no claim, its timestamp is at or after the
// attempt began, and no other begun send has the same number and body. A provider that rounds its
// timestamps down may stamp an earlier text with the attempt's own tick, so that text asks the user.
export function pickSendSettlement(evidence: SendEvidence): SendSettlementPick {
  if (evidence.candidates.length === 0) {
    return { kind: 'not_found' };
  }

  const free = evidence.candidates.filter(
    (candidate) => !evidence.claimedMessageIDs.includes(candidate.messageID),
  );

  const [only] = free;

  if (free.length !== 1 || only === undefined || only.createdAt < evidence.attemptStartedAt) {
    return { kind: 'inconclusive' };
  }

  const hasOverlap = evidence.open.some(
    (other) => other.to === evidence.request.to && other.body === evidence.request.body,
  );

  return hasOverlap ? { kind: 'inconclusive' } : { kind: 'claim', messageID: only.messageID };
}
