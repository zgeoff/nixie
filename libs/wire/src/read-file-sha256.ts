export interface FileDigest {
  readonly bytes: number;
  readonly sha256: string;
}

export async function readFileSHA256(path: string): Promise<FileDigest> {
  const hasher = new Bun.CryptoHasher('sha256');

  const counted = { bytes: 0 };

  for await (const chunk of Bun.file(path).stream()) {
    hasher.update(chunk);

    counted.bytes += chunk.byteLength;
  }

  return { bytes: counted.bytes, sha256: hasher.digest('hex') };
}
