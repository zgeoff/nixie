import { encodeSealedJSON } from './encode-sealed-json';

// The free text of a consolidation change, which nixie seals under its first input's key, so a
// forget of that item makes the change unreadable too.
export interface ChangeText {
  // the text the change writes, or null for a retirement
  readonly text: string | null;
  readonly reason: string;
  readonly salt: string;
}

// Seals a change's text under its first input's key, with the change ID as additional data, so the
// ciphertext opens under no other change.
export function encodeChangeText(
  key: CryptoKey,
  changeID: string,
  text: ChangeText,
): Promise<string> {
  return encodeSealedJSON(key, `consolidation/${changeID}`, { ...text });
}
