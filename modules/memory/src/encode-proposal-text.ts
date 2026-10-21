import { defineSealedCodec } from './define-sealed-codec';
import { proposalTextSchema } from './proposal-text-schema';
import type { ProposalText } from './sealed-types';

const proposalText = defineSealedCodec('proposal/', proposalTextSchema);

export function encodeProposalText(
  key: CryptoKey,
  proposalID: string,
  text: ProposalText,
): Promise<string> {
  return proposalText.encode(key, proposalID, text);
}
