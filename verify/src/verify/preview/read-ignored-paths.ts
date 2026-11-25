import { $ } from 'bun';

// `git check-ignore` exits 1 when it ignores none of the paths, and refuses an empty list.
export async function readIgnoredPaths(paths: readonly string[]): Promise<ReadonlySet<string>> {
  if (paths.length === 0) {
    return new Set();
  }

  const checked = await $`git check-ignore -- ${paths}`.quiet().nothrow();

  return new Set(
    checked.stdout
      .toString()
      .split('\n')
      .filter((path) => path !== ''),
  );
}
