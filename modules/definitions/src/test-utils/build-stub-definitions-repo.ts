import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { DefinitionsChange, DefinitionsRepo, PullRequestRef } from '../types';

interface StubPullRequest extends PullRequestRef {
  readonly change: DefinitionsChange;

  readonly revision: string;
  readonly state: 'open' | 'closed' | 'merged';
}

export interface StubDefinitionsRepo extends DefinitionsRepo {
  readonly readPullRequests: () => readonly StubPullRequest[];

  readonly mergePullRequest: (pullRequestNumber: number) => Promise<void>;

  readonly loseNextAnswer: () => void;

  readonly delayNextAnswer: (work: () => Promise<unknown>) => void;
}

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

  let isNextAnswerLost = false;
  let nextAnswerDelay: (() => Promise<unknown>) | null = null;

  const writeOpen = (change: DefinitionsChange, revision: string): PullRequestRef => {
    const open = pullRequests.find(
      (request) => request.change.branch === change.branch && request.state === 'open',
    );

    if (open !== undefined) {
      replace(open.number, { change, revision });

      return { number: open.number, url: open.url };
    }

    const pullRequestNumber = pullRequests.length + 1;
    const url = `https://definitions.test/pull/${pullRequestNumber}`;

    pullRequests.push({ number: pullRequestNumber, url, change, revision, state: 'open' });

    return { number: pullRequestNumber, url };
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

    writePullRequest: async (change, revision) => {
      const written = writeOpen(change, revision);
      const delay = nextAnswerDelay;

      nextAnswerDelay = null;

      if (delay !== null) {
        await delay();
      }

      if (isNextAnswerLost) {
        isNextAnswerLost = false;
        throw new Error('the answer to the pull request write was lost');
      }

      return written;
    },

    loseNextAnswer: () => {
      isNextAnswerLost = true;
    },

    delayNextAnswer: (work) => {
      nextAnswerDelay = work;
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
