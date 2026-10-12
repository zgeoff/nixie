import { encodeSealedJSON } from './encode-sealed-json';

// The free text of a memory proposal, which nixie seals under its item's key, so a forget of the
// item makes the proposal unreadable too.
export interface ProposalText {
  // the proposed text, or the item's text for a retirement
  readonly text: string;
  readonly quote: string | null;
  readonly checkerReason: string | null;
  readonly salt: string;
}

// Seals a proposal's text under its item's key, with the proposal ID as additional data, so the
// ciphertext opens under no other proposal.
export function encodeProposalText(
  key: CryptoKey,
  proposalID: string,
  text: ProposalText,
): Promise<string> {
  return encodeSealedJSON(key, `proposal/${proposalID}`, { ...text });
}
