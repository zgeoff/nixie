import { changeTextSchema } from './change-text-schema';
import { defineSealedCodec } from './define-sealed-codec';
import type { ChangeText } from './sealed-types';

const changeText = defineSealedCodec('consolidation/', changeTextSchema);

// Opens what encodeChangeText sealed. A wrong key, another change's ID or a changed byte rejects.
export function decodeChangeText(
  key: CryptoKey,
  changeID: string,
  sealed: string,
): Promise<ChangeText> {
  return changeText.decode(key, changeID, sealed);
}
