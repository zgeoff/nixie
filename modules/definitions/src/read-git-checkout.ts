import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface GitCheckout {
  readonly commit: string;
  readonly repository: string | null;
}

const commitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export async function readGitCheckout(directory: string): Promise<GitCheckout | null> {
  const gitDir = await readGitDir(directory);

  if (gitDir === null) {
    return null;
  }

  const head = await readText(join(gitDir, 'HEAD'));

  const commit = head?.trim() ?? '';

  if (!commitPattern.test(commit)) {
    return null;
  }

  const commonDir = await readText(join(gitDir, 'commondir'));

  const commonPath = resolve(gitDir, commonDir?.trim() ?? '.');

  const config = await readText(join(commonPath, 'config'));

  const origin = config === null ? null : parseOriginURL(config);

  return { commit, repository: origin === null ? null : toRedactedURL(origin) };
}

async function readGitDir(directory: string): Promise<string | null> {
  const link = await readText(join(directory, '.git'));

  const gitDir = link === null ? undefined : /^gitdir:\s*(?<path>.+)$/u.exec(link.trim())?.groups;

  return gitDir?.['path'] === undefined ? null : resolve(directory, gitDir['path']);
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }

    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR')
  );
}

function parseOriginURL(config: string): string | null {
  let isInOrigin = false;

  for (const line of config.split(/\r?\n/u).map((text) => text.trim())) {
    if (line.startsWith('[')) {
      isInOrigin = /^\[\s*remote\s+"origin"\s*\]$/iu.test(line);
    }

    const url = isInOrigin ? /^url\s*=\s*(?<value>.+)$/iu.exec(line)?.groups?.['value'] : undefined;

    if (url !== undefined) {
      return url.replace(/^"(?<quoted>.*)"$/u, '$<quoted>');
    }
  }

  return null;
}

function toRedactedURL(origin: string): string {
  if (!URL.canParse(origin)) {
    return origin;
  }

  const url = new URL(origin);

  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';

  return url.href;
}
