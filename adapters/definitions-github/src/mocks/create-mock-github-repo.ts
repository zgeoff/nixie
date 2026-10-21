import { faker } from '@faker-js/faker';
import { githubStore } from './github-store';

export interface MockGitHubRepo {
  // owner/name, the branch that holds its one empty commit, and the token it accepts
  readonly repository: string;
  readonly base: string;
  readonly token: string;
}

// Creates a repo in the mock GitHub whose base branch holds one commit of an empty tree.
export async function createMockGitHubRepo(repo: MockGitHubRepo): Promise<void> {
  const tree = await githubStore.trees.create({ sha: faker.git.commitSha(), files: {} });
  const commit = await githubStore.commits.create({ sha: faker.git.commitSha(), tree: tree.sha });

  await githubStore.repos.create({ repository: repo.repository, token: repo.token });

  await githubStore.refs.create({
    repository: repo.repository,
    branch: repo.base,
    sha: commit.sha,
  });
}
