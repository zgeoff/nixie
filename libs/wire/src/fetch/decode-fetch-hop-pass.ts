import { parseFetchObject } from './parse-fetch-object';

export function decodeFetchHopPass(bytes: Uint8Array): void {
  if (parseFetchObject(bytes, 'reply')['kind'] !== 'hop-pass') {
    throw new TypeError('a fetch hop needs a hop-pass frame in answer');
  }
}
