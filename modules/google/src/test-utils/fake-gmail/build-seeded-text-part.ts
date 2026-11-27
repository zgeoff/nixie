import type { FakePart } from './parse-fake-raw';

export function buildSeededTextPart(type: string, text: string, partID: string): FakePart {
  return {
    partID,
    mimeType: type,
    filename: '',
    headers: [['Content-Type', `${type}; charset=UTF-8`]],
    bytes: new TextEncoder().encode(text),
    parts: [],
  };
}
