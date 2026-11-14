import { $ } from 'bun';

// The newest release tag merged into HEAD whose commit is not HEAD itself, so a release commit
// finds the release before it.
export async function readPreviousReleaseTag(gitDir: string): Promise<string> {
  const output = await $`git tag --merged HEAD --list ${'v*'} --sort=-v:refname`.cwd(gitDir).text();

  const names = output.split('\n').filter((name) => name !== '');

  const tag = await readTagBeforeHead(gitDir, names);

  if (tag === null) {
    throw new Error(`no v* tag is merged into HEAD, apart from one on HEAD itself, in ${gitDir}`);
  }

  return tag;
}

async function readTagBeforeHead(gitDir: string, names: readonly string[]): Promise<string | null> {
  if (names.length === 0) {
    return null;
  }

  const [head, tagCommits] = await Promise.all([
    $`git rev-parse HEAD`.cwd(gitDir).text(),
    $`git rev-parse ${names.map((name) => `${name}^{commit}`)}`.cwd(gitDir).text(),
  ]);

  const commits = tagCommits.trim().split('\n');

  return names.find((_name, index) => commits[index] !== head.trim()) ?? null;
}
