import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { parsePackageTarball } from '../package/parse-package-tarball';
import { decodeContent } from './decode-content';
import { readLimitedBody } from './read-limited-body';

interface PackageRead {
  // the registry's sha512 of the tarball, as `sha512-<base64>`
  readonly integrity: string;
  readonly unpackedBytes: number;
  readonly limits: FetchLimits;
}

// room for the tar's own headers beside the files, which the registry's unpacked size leaves out
const tarballSlackBytes = 1024 * 1024;

// The tarball at the URL, checked against the integrity the caller names before any of it is
// unpacked. A tarball that fails the check, or that unpacks to a link, an unsafe path or more than
// `unpackedBytes`, comes back refused with no file.
export async function readResponsePackage(
  url: URL,
  response: IncomingMessage,
  read: PackageRead,
): Promise<FetchReply> {
  const status = response.statusCode ?? 0;

  try {
    if (status !== 200) {
      return { kind: 'failed', reason: `the registry answered ${String(status)}`, isGated: false };
    }

    const body = await readLimitedBody(
      decodeContent(response, response.headers['content-encoding']),
      read.unpackedBytes + tarballSlackBytes,
    );

    if (body.isTruncated) {
      return { kind: 'refused', reason: 'the tarball is over the size limit', isGated: false };
    }

    if (!isIntegrityMet(body.bytes, read.integrity)) {
      return {
        kind: 'refused',
        reason: 'the tarball does not match the integrity hash that was approved',
        isGated: false,
      };
    }

    const parsed = parsePackageTarball(body.bytes, read.unpackedBytes);

    if (parsed.kind === 'refused') {
      return { kind: 'refused', reason: parsed.reason, isGated: false };
    }

    return {
      kind: 'package',
      url: url.href,
      files: parsed.files.map((file) => ({
        path: file.path,
        base64: Buffer.from(file.bytes).toString('base64'),
      })),
      isGated: false,
    };
  } finally {
    response.destroy();
  }
}

// true for a sha512 integrity that the bytes match
function isIntegrityMet(bytes: Uint8Array, integrity: string): boolean {
  const expected = /^sha512-(?<hash>[A-Za-z0-9+/]{86}==)$/u.exec(integrity)?.groups?.['hash'];

  if (expected === undefined) {
    return false;
  }

  const wanted = Buffer.from(expected, 'base64');
  const actual = createHash('sha512').update(bytes).digest();

  return wanted.length === actual.length && timingSafeEqual(wanted, actual);
}
