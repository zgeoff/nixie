import { faker } from '@faker-js/faker';
import { githubStore } from './github-store';

export interface MockGitHubRepo {
  readonly repository: string;
  readonly base: string;
  readonly token: string;
}

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
