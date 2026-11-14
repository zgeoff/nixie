import { githubStore } from './github-store';

export function readMockFiles(
  repository: string,
  revision: string,
): Readonly<Record<string, string>> | null {
  const ref = githubStore.refs.findFirst((query) => query.where({ repository, branch: revision }));
  const sha = ref?.sha ?? revision;
  const commit = githubStore.commits.findFirst((query) => query.where({ sha }));

  const tree =
    commit === undefined
      ? undefined
      : githubStore.trees.findFirst((query) => query.where({ sha: commit.tree }));

  return tree?.files ?? null;
}
