import { gunzipSync } from 'node:zlib';
import { maxPackageFiles } from '@heynixie/wire';

export interface PackageFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export type ParsedPackage =
  | { readonly kind: 'files'; readonly files: readonly PackageFile[] }
  | { readonly kind: 'refused'; readonly reason: string };

const blockBytes = 512;

// headers, padding and the end of the archive, beside the files' own bytes
const archiveOverheadBytes = 4 * 1024 * 1024;

// Unpacks the gzipped tar of an npm package into its files, with the package folder removed from
// each path. One bad entry, or a size past `maxBytes` or `maxPackageFiles`, refuses the package.
export function parsePackageTarball(tarball: Uint8Array, maxBytes: number): ParsedPackage {
  const archive = unzip(tarball, maxBytes + archiveOverheadBytes);

  if (archive === null) {
    return refuse('the tarball is not gzip, or it unpacks past the size limit');
  }

  const files = new Map<string, Uint8Array>();

  const state: { offset: number; total: number; name: string | null } = {
    offset: 0,
    total: 0,
    name: null,
  };

  while (state.offset + blockBytes <= archive.byteLength) {
    const header = archive.subarray(state.offset, state.offset + blockBytes);

    if (header.every((byte) => byte === 0)) {
      break;
    }

    const size = toOctal(header, 124, 12);

    if (size === null) {
      return refuse('the tarball holds an entry with no readable size');
    }

    const start = state.offset + blockBytes;
    const end = start + size;

    if (end > archive.byteLength) {
      return refuse('the tarball ends inside an entry');
    }

    const body = archive.subarray(start, end);

    state.offset = start + Math.ceil(size / blockBytes) * blockBytes;

    const type = String.fromCodePoint(header[156] ?? 0);

    if (type === 'x' || type === 'L') {
      state.name = pickLongName(type, body);
      continue;
    }

    if (type === 'g' || type === '5') {
      continue;
    }

    if (type !== '0' && type !== '\0') {
      return refuse('the tarball holds a link or another entry that is not a file');
    }

    const entryPath = state.name ?? pickEntryName(header);

    state.name = null;

    const relative = pickPackagePath(entryPath);

    if (relative.kind === 'refused') {
      return relative;
    }

    state.total += size;

    if (state.total > maxBytes) {
      return refuse(`the package unpacks past ${String(maxBytes)} bytes`);
    }

    if (files.has(relative.path)) {
      return refuse(`the tarball holds ${relative.path} twice`);
    }

    if (files.size >= maxPackageFiles) {
      return refuse(`the package holds more than ${String(maxPackageFiles)} files`);
    }

    files.set(relative.path, new Uint8Array(body));
  }

  return {
    kind: 'files',
    files: [...files].map(([path, bytes]) => ({ path, bytes })),
  };
}

function unzip(tarball: Uint8Array, limitBytes: number): Uint8Array | null {
  try {
    return gunzipSync(tarball, { maxOutputLength: limitBytes });
  } catch {
    return null;
  }
}

function refuse(reason: string): ParsedPackage {
  return { kind: 'refused', reason };
}

function toOctal(header: Uint8Array, from: number, length: number): number | null {
  const text = new TextDecoder()
    .decode(header.subarray(from, from + length))
    .replaceAll('\0', '')
    .trim();

  if (text === '') {
    return 0;
  }

  return /^[0-7]+$/u.test(text) ? Number.parseInt(text, 8) : null;
}

// the path that a pax record or a GNU long-name entry gives the entry after it
function pickLongName(type: string, body: Uint8Array): string | null {
  const text = new TextDecoder().decode(body);

  if (type === 'L') {
    return text.replaceAll('\0', '');
  }

  return /(?:^|\n)\d+ path=(?<path>[^\n]*)\n/u.exec(text)?.groups?.['path'] ?? null;
}

// the ustar prefix and the name, which together are the path
function pickEntryName(header: Uint8Array): string {
  const prefix = toText(header, 345, 155);
  const name = toText(header, 0, 100);

  return prefix === '' ? name : `${prefix}/${name}`;
}

function toText(header: Uint8Array, from: number, length: number): string {
  const field = header.subarray(from, from + length);
  const end = field.indexOf(0);
  const text = end === -1 ? field : field.subarray(0, end);

  return new TextDecoder().decode(text);
}

// the longest path inside a package, which leaves room for the folder that a preview puts it under
const maxPathChars = 200;

function pickPackagePath(
  entryPath: string,
):
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'refused'; readonly reason: string } {
  const segments = entryPath.split('/');

  const isUnsafe =
    entryPath.startsWith('/') ||
    entryPath.includes('\\') ||
    entryPath.includes('\0') ||
    segments.some((segment) => segment === '..' || segment === '.' || segment === '');

  if (isUnsafe) {
    return { kind: 'refused', reason: `the tarball holds the path ${JSON.stringify(entryPath)}` };
  }

  const [folder, ...rest] = segments;

  if (folder !== 'package' || rest.length === 0) {
    return {
      kind: 'refused',
      reason: `the tarball holds ${JSON.stringify(entryPath)}, outside the package folder`,
    };
  }

  const path = rest.join('/');

  return path.length > maxPathChars
    ? {
        kind: 'refused',
        reason: `the tarball holds a path of over ${String(maxPathChars)} characters`,
      }
    : { kind: 'path', path };
}
