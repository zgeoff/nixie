// `committed` is `git ls-tree -r HEAD` output, and `served` holds one `<blob id> <path>` line per
// file in the container.
export function pickSourceRefusal(committed: string, served: string): string | null {
  const servedBlobs = collectServedBlobs(served);
  const differing: string[] = [];

  for (const line of committed.split('\n')) {
    const entry = parseTreeLine(line);

    if (entry === null) {
      continue;
    }

    const servedBlob = servedBlobs.get(entry.path);

    if (servedBlob === undefined ? !isLeftOutOfImage(entry.path) : servedBlob !== entry.blob) {
      differing.push(entry.path);
    }
  }

  if (differing.length === 0) {
    return null;
  }

  return `the running preview holds other sources than this tree in ${differing.length} files, such as ${differing.slice(0, 3).join(', ')}`;
}

function collectServedBlobs(served: string): Map<string, string> {
  const blobs = new Map<string, string>();

  for (const line of served.split('\n')) {
    const space = line.indexOf(' ');

    if (space > 0) {
      blobs.set(line.slice(space + 1), line.slice(0, space));
    }
  }

  return blobs;
}

interface TreeEntry {
  readonly blob: string;
  readonly path: string;
}

function parseTreeLine(line: string): TreeEntry | null {
  const parsed = /^\d+ blob (?<blob>[0-9a-f]+)\t(?<path>.+)$/u.exec(line);
  const blob = parsed?.groups?.['blob'];
  const path = parsed?.groups?.['path'];

  return blob === undefined || path === undefined ? null : { blob, path };
}

// The image build leaves out each `.env` file, as the repo's .dockerignore says.
function isLeftOutOfImage(path: string): boolean {
  const name = path.split('/').at(-1) ?? path;

  return name === '.env' || name.startsWith('.env.');
}
