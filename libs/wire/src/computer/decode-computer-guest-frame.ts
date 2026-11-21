import { parseJSONOrNull } from '../utils/parse-json-or-null';
import type { ComputerHopFrame } from './computer-hop-frame';
import type { ComputerReply } from './computer-reply';
import { computerReplySchema } from './computer-reply';

const decoder = new TextDecoder();

export type ComputerGuestFrame = ComputerHopFrame | ComputerReply;

// A frame from a computer guest: a hop to scan, or the reply that ends a request.
export function decodeComputerGuestFrame(bytes: Uint8Array): ComputerGuestFrame {
  const value = parseJSONOrNull(decoder.decode(bytes));

  if (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'hop' &&
    'url' in value &&
    typeof value.url === 'string'
  ) {
    return { kind: 'hop', url: value.url };
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'hop-content' &&
    'text' in value &&
    typeof value.text === 'string'
  ) {
    return { kind: 'hop-content', text: value.text };
  }

  return computerReplySchema.parse(value);
}
