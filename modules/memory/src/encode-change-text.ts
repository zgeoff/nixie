import { changeTextSchema } from './change-text-schema';
import { defineSealedCodec } from './define-sealed-codec';
import type { ChangeText } from './sealed-types';

// Seals a change's text under its first input's key, with the change ID as additional data, so the
// ciphertext opens under no other change.
export function encodeChangeText(
  key: CryptoKey,
  changeID: string,
  text: ChangeText,
): Promise<string> {
  return changeText.encode(key, changeID, text);
}

const changeText = defineSealedCodec('consolidation/', changeTextSchema);
