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
      isInOrigin = /^\[\s*remote\s+"origin"\s*\]\s*(?:[#;].*)?$/iu.test(line);
    }

    const raw = isInOrigin ? /^url\s*=(?<value>.*)$/iu.exec(line)?.groups?.['value'] : undefined;
    const url = raw === undefined ? '' : parseConfigValue(raw);

    if (url !== '') {
      return url;
    }
  }

  return null;
}

const configEscapes = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['b', '\b'],
]);

// A git config value can hold quoted runs, escapes and a trailing comment, and a URL read without
// that parse keeps them, fails URL parsing and skips the redaction.
function parseConfigValue(raw: string): string {
  let value = '';
  let isQuoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw.charAt(index);

    if (char === '\\') {
      index += 1;
      value += configEscapes.get(raw.charAt(index)) ?? raw.charAt(index);
    } else if (char === '"') {
      isQuoted = !isQuoted;
    } else if (!isQuoted && (char === '#' || char === ';')) {
      break;
    } else {
      value += char;
    }
  }

  return value.trim();
}

// An scp-style address such as `user:secret@host:path` parses as a URL whose scheme is the user
// name, so only a value with `://` goes through URL parsing.
function toRedactedURL(origin: string): string {
  if (!origin.includes('://') || !URL.canParse(origin)) {
    return origin.replace(/^(?<scheme>[^/@]*:\/\/)?[^/@]*@/u, '$<scheme>');
  }

  const url = new URL(origin);

  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';

  return url.href;
}
