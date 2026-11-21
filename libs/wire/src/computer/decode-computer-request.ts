import { parseJSONOrNull } from '../utils/parse-json-or-null';
import type { ComputerRequest } from './computer-request';
import { computerRequestSchema } from './computer-request';

const decoder = new TextDecoder();

export function decodeComputerRequest(bytes: Uint8Array): ComputerRequest {
  return computerRequestSchema.parse(parseJSONOrNull(decoder.decode(bytes)));
}
