import { defineSealedCodec } from './codec/define-sealed-codec';
import type { ProposalText } from './codec/sealed-codec';
import { proposalTextSchema } from './schema/proposal-text-schema';

const proposalText = defineSealedCodec('proposal/', proposalTextSchema);

export function decodeProposalText(
  key: CryptoKey,
  proposalID: string,
  sealed: string,
): Promise<ProposalText> {
  return proposalText.decode(key, proposalID, sealed);
}
