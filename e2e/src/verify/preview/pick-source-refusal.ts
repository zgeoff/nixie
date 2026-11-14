export interface ServedSources {
  // The container the listing came from, such as `nixie` or `web`.
  readonly container: string;

  // `git ls-tree -r HEAD` output for the source folders.
  readonly committed: string;

  // One `<blob id> <path>` line per file in the container.
  readonly served: string;

  // The paths the container holds and this tree lacks that git ignores, such as generated code.
  readonly ignored: ReadonlySet<string>;
}

// Why a running container cannot stand for this tree, or null when it holds every committed file
// unchanged, and no other file but ignored ones.
export function pickSourceRefusal(sources: ServedSources): string | null {
  const committedBlobs = collectCommittedBlobs(sources.committed);
  const servedBlobs = collectServedBlobs(sources.served);
  const differing: string[] = [];

  for (const [path, blob] of committedBlobs) {
    const servedBlob = servedBlobs.get(path);

    if (servedBlob === undefined ? !isLeftOutOfImage(path) : servedBlob !== blob) {
      differing.push(path);
    }
  }

  for (const path of servedBlobs.keys()) {
    if (!committedBlobs.has(path) && !sources.ignored.has(path)) {
      differing.push(path);
    }
  }

  if (differing.length === 0) {
    return null;
  }

  return `the running ${sources.container} container holds other sources than this tree in ${differing.length} files, such as ${differing.slice(0, 3).join(', ')}`;
}

// The paths a container holds that the commit lacks, for the caller to ask git which it ignores.
export function collectExtraPaths(committed: string, served: string): string[] {
  const committedBlobs = collectCommittedBlobs(committed);

  return [...collectServedBlobs(served).keys()].filter((path) => !committedBlobs.has(path));
}

function collectCommittedBlobs(committed: string): Map<string, string> {
  const blobs = new Map<string, string>();

  for (const line of committed.split('\n')) {
    const parsed = /^\d+ blob (?<blob>[0-9a-f]+)\t(?<path>.+)$/u.exec(line);
    const blob = parsed?.groups?.['blob'];
    const path = parsed?.groups?.['path'];

    if (blob !== undefined && path !== undefined) {
      blobs.set(path, blob);
    }
  }

  return blobs;
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

// The image builds leave out each `.env` file and each `dist` folder, as their .dockerignore files
// say.
function isLeftOutOfImage(path: string): boolean {
  const segments = path.split('/');
  const name = segments.at(-1) ?? path;

  return segments.includes('dist') || name === '.env' || name.startsWith('.env.');
}
