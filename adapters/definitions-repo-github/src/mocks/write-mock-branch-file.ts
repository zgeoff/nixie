import { faker } from '@faker-js/faker';
import invariant from 'tiny-invariant';
import { githubStore } from './github-store';
import { readMockFiles } from './read-mock-files';

export interface MockBranchFile {
  readonly repository: string;
  readonly branch: string;
  readonly path: string;
  readonly text: string;
}

export async function writeMockBranchFile(file: MockBranchFile): Promise<void> {
  const ref = githubStore.refs.findFirst((query) =>
    query.where({ repository: file.repository, branch: file.branch }),
  );

  invariant(ref);

  const files = { ...readMockFiles(file.repository, file.branch), [file.path]: file.text };

  const tree = await githubStore.trees.create({ sha: faker.git.commitSha(), files });

  const commit = await githubStore.commits.create({
    sha: faker.git.commitSha(),
    tree: tree.sha,
    parents: [ref.sha],
  });

  await githubStore.refs.update(ref, {
    data(draft) {
      draft.sha = commit.sha;
    },
  });
}
