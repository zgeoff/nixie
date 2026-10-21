import { defineSealedCodec } from './define-sealed-codec';
import { proposalTextSchema } from './proposal-text-schema';
import type { ProposalText } from './sealed-types';

const proposalText = defineSealedCodec('proposal/', proposalTextSchema);

export function decodeProposalText(
  key: CryptoKey,
  proposalID: string,
  sealed: string,
): Promise<ProposalText> {
  return proposalText.decode(key, proposalID, sealed);
}
