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

// Puts a file on a branch of a repo in the mock GitHub as a new commit on the branch's head, as a
// push to the branch does.
export async function writeMockBranchFile(file: MockBranchFile): Promise<void> {
  const ref = githubStore.refs.findFirst((query) =>
    query.where({ repository: file.repository, branch: file.branch }),
  );

  // a test writes only to a branch of a repo it created
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
