import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import type { ChangeText } from '../utils/codec/sealed-codec';
import { changeTextSchema } from '../utils/schema/change-text-schema';

const changeText = defineSealedCodec('consolidation/', changeTextSchema);

export function encodeChangeText(
  key: CryptoKey,
  changeID: string,
  text: ChangeText,
): Promise<string> {
  return changeText.encode(key, changeID, text);
}
