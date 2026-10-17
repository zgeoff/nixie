import { mkdir, rename } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { ChecksumMismatchError } from './checksum-mismatch-error';
import { DownloadFailedError } from './download-failed-error';
import { PinnedFileListError } from './pinned-file-list-error';

interface PinnedFile {
  readonly path: string;
  readonly url: string;
  readonly sha256: string;
}

// Downloads each file a pinned file list names into outDir, checking its SHA-256 before it writes
// it, so a file that differs never reaches outDir. A file already there with that SHA-256 stays,
// with no download. It returns each file's path in outDir, in list order.
export async function writePinnedFiles(
  listText: string,
  outDir: string,
): Promise<readonly string[]> {
  const files = parsePinnedFileList(listText);
  const written: string[] = [];

  for (const file of files) {
    const path = await writePinnedFile(file, outDir);

    written.push(path);
  }

  return written;
}

// Each line that is not blank or a # comment is a relative path, a URL and a SHA-256, split by
// spaces. A path that leaves the folder it names, by an absolute path or a .. part, is refused.
function parsePinnedFileList(text: string): readonly PinnedFile[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [path, url, sha256, ...rest] = line.split(/\s+/u);

      if (
        path === undefined ||
        url === undefined ||
        sha256 === undefined ||
        rest.length > 0 ||
        !/^[0-9a-f]{64}$/u.test(sha256) ||
        isAbsolute(path) ||
        normalize(path).split('/').includes('..')
      ) {
        throw new PinnedFileListError(line);
      }

      return { path, url, sha256 };
    });
}

async function writePinnedFile(file: PinnedFile, outDir: string): Promise<string> {
  const target = join(outDir, file.path);

  const isInPlace = await hasPinnedFile(target, file.sha256);

  if (!isInPlace) {
    const bytes = await readCheckedFile(file);

    await writeWholeFile(target, bytes);
  }

  return target;
}

async function hasPinnedFile(target: string, sha256: string): Promise<boolean> {
  const existing = Bun.file(target);

  const exists = await existing.exists();

  if (!exists) {
    return false;
  }

  const bytes = await existing.bytes();

  return buildSHA256(bytes) === sha256;
}

async function readCheckedFile(file: PinnedFile): Promise<Uint8Array> {
  const response = await fetch(file.url);

  if (!response.ok) {
    throw new DownloadFailedError(file.url, response.status);
  }

  const bytes = await response.bytes();

  const actual = buildSHA256(bytes);

  if (actual !== file.sha256) {
    throw new ChecksumMismatchError(file.path, file.sha256, actual);
  }

  return bytes;
}

// a rename puts the whole file in place at once, so a stopped download leaves no partial file under
// the pinned name
async function writeWholeFile(target: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(target), { recursive: true });

  await Bun.write(`${target}.part`, bytes);

  await rename(`${target}.part`, target);
}

function buildSHA256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}
