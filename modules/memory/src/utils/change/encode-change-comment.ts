import { defineSealedCodec } from '../codec/define-sealed-codec';
import { sealedTextSchema } from '../schema/sealed-text-schema';

const changeComment = defineSealedCodec('consolidation-comment/', sealedTextSchema);

export function encodeChangeComment(
  key: CryptoKey,
  changeID: string,
  text: string,
): Promise<string> {
  return changeComment.encode(key, changeID, { text });
}
