import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { DefinitionsChange, DefinitionsRepo, PullRequestRef } from '../types';

interface StubPullRequest extends PullRequestRef {
  readonly change: DefinitionsChange;

  // the base revision the change was built on
  readonly revision: string;
  readonly state: 'open' | 'closed' | 'merged';
}

export interface StubDefinitionsRepo extends DefinitionsRepo {
  readonly readPullRequests: () => readonly StubPullRequest[];

  // writes the pull request's change into the base branch's folder, as your merge does
  readonly mergePullRequest: (pullRequestNumber: number) => Promise<void>;
}

// A definitions repo whose base branch is a folder on disk, whose base revision is the hash of the
// folder's files, and whose pull requests live in memory. It reads only at the newest revision, and
// a change on a branch with an open pull request replaces that pull request's change.
export function buildStubDefinitionsRepo(directory: string): StubDefinitionsRepo {
  const pullRequests: StubPullRequest[] = [];

  const replace = (pullRequestNumber: number, update: Partial<StubPullRequest>) => {
    const index = pullRequests.findIndex((request) => request.number === pullRequestNumber);
    const found = pullRequests[index];

    if (found === undefined) {
      throw new Error(`no pull request is numbered ${pullRequestNumber}`);
    }

    pullRequests[index] = { ...found, ...update };

    return found;
  };

  const requireRevision = async (revision: string) => {
    const newest = await readRevision(directory);

    if (revision !== newest) {
      throw new Error(`the stub holds only the newest base revision, not ${revision}`);
    }
  };

  return {
    readBaseRevision: () => readRevision(directory),

    readFile: async (path, revision) => {
      await requireRevision(revision);

      const file = Bun.file(join(directory, path));

      const isFound = await file.exists();

      return isFound ? file.text() : null;
    },

    readFolder: async (path, revision) => {
      await requireRevision(revision);

      return readFilePaths(join(directory, path));
    },

    writePullRequest: (change, revision) => {
      const open = pullRequests.find(
        (request) => request.change.branch === change.branch && request.state === 'open',
      );

      if (open !== undefined) {
        replace(open.number, { change, revision });

        return Promise.resolve({ number: open.number, url: open.url });
      }

      const pullRequestNumber = pullRequests.length + 1;
      const url = `https://definitions.test/pull/${pullRequestNumber}`;

      pullRequests.push({ number: pullRequestNumber, url, change, revision, state: 'open' });

      return Promise.resolve({ number: pullRequestNumber, url });
    },

    readOpenPullRequest: (branch) => {
      const open = pullRequests.find(
        (request) => request.change.branch === branch && request.state === 'open',
      );

      const found = open === undefined ? null : { number: open.number, url: open.url };

      return Promise.resolve(found);
    },

    closePullRequest: (pullRequestNumber) => {
      replace(pullRequestNumber, { state: 'closed' });

      return Promise.resolve();
    },

    readPullRequests: () => [...pullRequests],

    mergePullRequest: async (pullRequestNumber) => {
      const merged = replace(pullRequestNumber, { state: 'merged' });

      for (const [path, text] of merged.change.files) {
        const target = join(directory, path);

        if (text === null) {
          await rm(target, { force: true });
        } else {
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, text);
        }
      }
    },
  };
}

// the hash of every file's path and text under the folder
async function readRevision(directory: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');

  for (const path of await readFilePaths(directory)) {
    const bytes = await Bun.file(join(directory, path)).bytes();

    hasher.update(`${path}\0`);
    hasher.update(bytes);
    hasher.update('\0');
  }

  return hasher.digest('hex');
}

// the path of each file under the folder, from the folder with forward slashes, or none when the
// folder is missing
async function readFilePaths(folder: string): Promise<readonly string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(
    (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return [];
      }

      throw error;
    },
  );

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .toSorted();
}
