import { parseJSONOrNull } from '../utils/parse-json-or-null';
import type { RenderRequest } from './render-request';
import { renderRequestSchema } from './render-request';

const decoder = new TextDecoder();

export function decodeRenderRequest(bytes: Uint8Array): RenderRequest {
  return renderRequestSchema.parse(parseJSONOrNull(decoder.decode(bytes)));
}
