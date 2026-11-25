import type { RenderReply, RenderRequest } from './render-request';

const encoder = new TextEncoder();

export function encodeRenderMessage(message: RenderRequest | RenderReply): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}
