import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

export interface TarballEntry {
  readonly path: string;
  readonly content?: string;

  // the tar type flag: '0' for a file, '2' for a symlink, '1' for a hard link
  readonly type?: string;
}

// The gzipped tar of a package, with each path as given, so a test can build the paths that the
// reader must refuse.
export function buildPackageTarball(entries: readonly TarballEntry[]): Uint8Array<ArrayBuffer> {
  const blocks = entries.flatMap((entry) => {
    const body = Buffer.from(entry.content ?? '');
    const header = Buffer.alloc(512);

    header.write(entry.path, 0, 100);
    header.write('0000644\0', 100);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write(entry.type ?? '0', 156);
    header.write('ustar\0', 257);

    const sum = header.reduce((total, byte) => total + byte, 8 * 32);

    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);

    return [header, body, Buffer.alloc((512 - (body.length % 512)) % 512)];
  });

  const tar = Buffer.concat([...blocks, Buffer.alloc(1024)]);

  return new Uint8Array(gzipSync(tar));
}

// the registry's integrity string for the bytes
export function buildIntegrity(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}
