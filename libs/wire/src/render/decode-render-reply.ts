import { parseJSONOrNull } from '../utils/parse-json-or-null';
import type { RenderReply } from './render-request';
import { renderReplySchema } from './render-request';

const decoder = new TextDecoder();

export function decodeRenderReply(bytes: Uint8Array): RenderReply {
  return renderReplySchema.parse(parseJSONOrNull(decoder.decode(bytes)));
}
