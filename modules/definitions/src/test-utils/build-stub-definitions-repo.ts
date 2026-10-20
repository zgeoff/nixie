import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DefinitionsChange, DefinitionsRepo, PullRequestRef } from '../types';

interface StubPullRequest extends PullRequestRef {
  readonly change: DefinitionsChange;
  readonly state: 'open' | 'closed' | 'merged';
}

export interface StubDefinitionsRepo extends DefinitionsRepo {
  readonly readPullRequests: () => readonly StubPullRequest[];

  // writes the pull request's change into the base branch's folder, as your merge does
  readonly mergePullRequest: (pullRequestNumber: number) => Promise<void>;
}

// A definitions repo whose base branch is a folder on disk, the folder a path source reads, and
// whose pull requests live in memory. A change on a branch with an open pull request replaces that
// pull request's change, as a forced push to its branch does.
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

  return {
    readFile: async (path) => {
      const file = Bun.file(join(directory, path));

      const isFound = await file.exists();

      return isFound ? file.text() : null;
    },

    writePullRequest: (change) => {
      const open = pullRequests.find(
        (request) => request.change.branch === change.branch && request.state === 'open',
      );

      if (open !== undefined) {
        replace(open.number, { change });

        return Promise.resolve({ number: open.number, url: open.url });
      }

      const pullRequestNumber = pullRequests.length + 1;
      const url = `https://definitions.test/pull/${pullRequestNumber}`;

      pullRequests.push({ number: pullRequestNumber, url, change, state: 'open' });

      return Promise.resolve({ number: pullRequestNumber, url });
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
