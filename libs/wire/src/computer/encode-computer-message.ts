import type { FetchHop, FetchHopPass } from '../utils/fetch-hop';
import type { ComputerReply } from './computer-reply';
import type { ComputerRequest } from './computer-request';

const encoder = new TextEncoder();

export function encodeComputerMessage(
  message: ComputerRequest | ComputerReply | FetchHop | FetchHopPass,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}
