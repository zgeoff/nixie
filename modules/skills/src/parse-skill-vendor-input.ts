import type { JSONObject } from '@heynixie/log';

export interface SkillVendorSource {
  readonly owner: string;
  readonly name: string;
  readonly repository: string;

  readonly path: string;
  readonly commit: string;
}

export type SkillVendorInput =
  | { readonly status: 'ok'; readonly source: SkillVendorSource }
  | { readonly status: 'refused'; readonly reason: string };

export function parseSkillVendorInput(input: JSONObject): SkillVendorInput {
  const repository = input['repository'];
  const path = input['path'];
  const commit = input['commit'];

  if (typeof repository !== 'string' || typeof path !== 'string' || typeof commit !== 'string') {
    return buildRefusal('give the repository, the path and the commit, each as a string');
  }

  const repo = parseRepository(repository);

  if (repo === null) {
    return buildRefusal(
      `${repository} is not a GitHub repository URL; give one such as https://github.com/example/skills`,
    );
  }

  const folder = parseFolderPath(path);

  if (folder === null) {
    return buildRefusal(
      `${path} is not a folder path inside the repository; give the skill's folder, such as skills/pdf-forms, with no . or .. parts`,
    );
  }

  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(commit)) {
    return buildRefusal(
      `${commit} is not a full commit SHA. Give all 40 lowercase hex characters of the commit, never a branch, a tag or a short SHA, because only a full SHA pins a version that cannot move.`,
    );
  }

  return {
    status: 'ok',
    source: {
      owner: repo.owner,
      name: repo.name,
      repository: `https://github.com/${repo.owner}/${repo.name}`,
      path: folder,
      commit,
    },
  };
}

function buildRefusal(reason: string): SkillVendorInput {
  return { status: 'refused', reason };
}

function parseRepository(text: string): { readonly owner: string; readonly name: string } | null {
  const url = URL.parse(text.trim());

  const isPlain =
    url !== null &&
    url.protocol === 'https:' &&
    url.hostname === 'github.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '';

  if (!isPlain) {
    return null;
  }

  const groups = /^\/(?<owner>[A-Za-z\d-]{1,39})\/(?<name>[\w.-]{1,100}?)(?:\.git)?\/?$/u.exec(
    url.pathname,
  )?.groups;

  const owner = groups?.['owner'];
  const name = groups?.['name'];

  if (owner === undefined || name === undefined || name === '.' || name === '..') {
    return null;
  }

  return { owner, name };
}

function parseFolderPath(text: string): string | null {
  const trimmed = text.trim().replaceAll(/^\/+|\/+$/gu, '');
  const parts = trimmed.split('/');

  // The pull request quotes the path in a code span, so a backtick or a line break would end it.
  const isPlain =
    trimmed !== '' &&
    trimmed.length <= 300 &&
    !/[`\p{Cc}]/u.test(trimmed) &&
    parts.every((part) => part !== '' && part !== '.' && part !== '..' && !part.includes('\\'));

  return isPlain ? trimmed : null;
}
