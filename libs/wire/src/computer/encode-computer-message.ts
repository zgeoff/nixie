import type { FetchHop, FetchHopPass } from '../utils/fetch-hop';
import type { ComputerReply } from './computer-reply';
import type { ComputerRequest } from './computer-request';

// The server's answer to a hop it refuses: the guest's navigation fails with the reason.
export interface ComputerHopRefuse {
  readonly kind: 'hop-refuse';
  readonly reason: string;
}

const encoder = new TextEncoder();

export function encodeComputerMessage(
  message: ComputerRequest | ComputerReply | FetchHop | FetchHopPass | ComputerHopRefuse,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}
