const extensionTypes: Readonly<Record<string, string>> = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sqlite: 'application/vnd.sqlite3',
  parquet: 'application/vnd.apache.parquet',
};

// The media type of a file: from its bytes for PNG, JPEG, GIF and WebP, else from its extension,
// else application/octet-stream.
export function pickMediaType(path: string, bytes: Uint8Array): string {
  const sniffed = sniffImageType(bytes);

  if (sniffed !== null) {
    return sniffed;
  }

  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const extension = dot < 1 ? '' : name.slice(dot + 1).toLowerCase();

  return extensionTypes[extension] ?? 'application/octet-stream';
}

function sniffImageType(bytes: Uint8Array): string | null {
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif';
  }

  const isRiff = hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]);
  const isWebP = bytes.length >= 12 && hasPrefix(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);

  return isRiff && isWebP ? 'image/webp' : null;
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
