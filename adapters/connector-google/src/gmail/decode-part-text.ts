import { TextDecoder } from 'node:util';

// Decodes a text part by the charset of its Content-Type header, as UTF-8 when the header names
// none or a charset that the runtime lacks.
export function decodePartText(bytes: Uint8Array, contentType: string | undefined): string {
  const charset =
    /charset="?(?<charset>[^";\s]+)"?/iu.exec(contentType ?? '')?.groups?.['charset'] ?? 'utf8';

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}
