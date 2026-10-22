import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FetchReply } from '@heynixie/wire';
import { $ } from 'bun';
import type { ReadPage } from '../read-github-skill';

export interface StubGitHubRepoOptions {
  readonly owner: string;
  readonly name: string;
  readonly files: Readonly<Record<string, string | Uint8Array>>;

  readonly verification?: { readonly verified: boolean; readonly reason: string };
}

export interface StubGitHubRepo {
  readonly commit: string;
  readonly readPage: ReadPage;

  readonly gitEnv: Readonly<Record<string, string>>;
}

interface StubGit {
  readonly directory: string;
  readonly env: Readonly<Record<string, string>>;
}

export async function createStubGitHubRepo(
  directory: string,
  options: StubGitHubRepoOptions,
): Promise<StubGitHubRepo> {
  await mkdir(directory, { recursive: true });

  for (const [path, content] of Object.entries(options.files)) {
    const target = join(directory, path);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  // git exports GIT_DIR to its hooks, which would point these git calls at the repo under test.
  const git: StubGit = {
    directory,
    env: { PATH: process.env['PATH'] ?? '', HOME: directory, GIT_CONFIG_NOSYSTEM: '1' },
  };

  await $`git init -q && git add -A && git -c user.name=Publisher -c user.email=publisher@example.test commit -q -m skill`
    .cwd(directory)
    .env(git.env)
    .quiet();

  const head = await $`git rev-parse HEAD`.cwd(directory).env(git.env).text();

  const api = `https://api.github.com/repos/${options.owner}/${options.name}/git/`;
  const raw = `https://raw.githubusercontent.com/${options.owner}/${options.name}/`;

  return {
    commit: head.trim(),
    gitEnv: git.env,
    readPage: (url) => {
      if (url.startsWith(`${api}commits/`)) {
        return readCommit(git, url, url.slice(`${api}commits/`.length), options);
      }

      if (url.startsWith(`${api}trees/`)) {
        const [sha = '', query] = url.slice(`${api}trees/`.length).split('?');

        return readTree(git, url, sha, query === 'recursive=1');
      }

      if (url.startsWith(raw)) {
        const [ref = '', ...parts] = url.slice(raw.length).split('/');
        const path = parts.map((part) => decodeURIComponent(part)).join('/');

        return readRaw(git, url, ref, path);
      }

      return Promise.resolve(buildJSONPage(url, 404, { message: 'Not Found' }));
    },
  };
}

async function readCommit(
  git: StubGit,
  url: string,
  sha: string,
  options: StubGitHubRepoOptions,
): Promise<FetchReply> {
  const type = await $`git cat-file -t ${sha}`.cwd(git.directory).env(git.env).quiet().nothrow();

  if (type.exitCode !== 0 || type.text().trim() !== 'commit') {
    return buildJSONPage(url, 422, { message: `No commit found for SHA: ${sha}` });
  }

  const tree = await $`git rev-parse ${`${sha}^{tree}`}`.cwd(git.directory).env(git.env).text();

  return buildJSONPage(url, 200, {
    sha,
    tree: { sha: tree.trim() },
    verification: {
      verified: options.verification?.verified ?? false,
      reason: options.verification?.reason ?? 'unsigned',
      signature: null,
      payload: null,
    },
  });
}

function buildJSONPage(url: string, status: number, body: unknown): FetchReply {
  return {
    kind: 'page',
    url,
    status,
    contentType: 'application/json; charset=utf-8',
    text: JSON.stringify(body),
    links: [],
    isTruncated: false,
    blocked: null,
  };
}

async function readTree(
  git: StubGit,
  url: string,
  sha: string,
  isRecursive: boolean,
): Promise<FetchReply> {
  const listing = isRecursive
    ? await $`git ls-tree -r -t -l ${sha}`.cwd(git.directory).env(git.env).quiet().nothrow()
    : await $`git ls-tree -l ${sha}`.cwd(git.directory).env(git.env).quiet().nothrow();

  if (listing.exitCode !== 0) {
    return buildJSONPage(url, 404, { message: 'Not Found' });
  }

  const tree = listing
    .text()
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [meta = '', path = ''] = line.split('\t');
      const [mode = '', type = '', entrySHA = '', size = '-'] = meta.split(/\s+/u);

      return size === '-'
        ? { path, mode, type, sha: entrySHA }
        : { path, mode, type, sha: entrySHA, size: Number(size) };
    });

  return buildJSONPage(url, 200, { sha, tree, truncated: false });
}

async function readRaw(git: StubGit, url: string, ref: string, path: string): Promise<FetchReply> {
  const blob = await $`git cat-file -p ${`${ref}:${path}`}`
    .cwd(git.directory)
    .env(git.env)
    .quiet()
    .nothrow();

  const isFound = blob.exitCode === 0;
  const text = isFound ? new TextDecoder().decode(blob.bytes()) : '404: Not Found';

  return {
    kind: 'page',
    url,
    status: isFound ? 200 : 404,
    contentType: 'text/plain; charset=utf-8',
    text,
    links: [],
    isTruncated: false,
    blocked: null,
  };
}
