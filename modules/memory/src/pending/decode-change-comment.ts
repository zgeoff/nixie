import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import { sealedTextSchema } from '../utils/schema/sealed-text-schema';

const changeComment = defineSealedCodec('consolidation-comment/', sealedTextSchema);

export async function decodeChangeComment(
  key: CryptoKey,
  changeID: string,
  sealed: string,
): Promise<string> {
  const comment = await changeComment.decode(key, changeID, sealed);

  return comment.text;
}
