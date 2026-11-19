// Each of these workflows runs its pull request jobs from <name>.yml and its push-to-main jobs from
// <name>-main.yml, because one file cannot cancel only its pull request runs and pass the workflow
// lint, so the two files must hold the same jobs.
export const copiedWorkflowNames = [
  'compatibility',
  'compose',
  'images',
  'npm-packages',
  'preview',
] as const;

// Returns the problem when the jobs of <name>-main.yml differ from those of <name>.yml, once each
// file's own path in its path filter is read as the other's.
export function checkPushWorkflowCopy(
  name: string,
  pullRequestText: string,
  mainText: string,
): readonly string[] {
  const mainJobs = readJobs(mainText).replaceAll(
    `.github/workflows/${name}-main.yml`,
    `.github/workflows/${name}.yml`,
  );

  return mainJobs === readJobs(pullRequestText)
    ? []
    : [`the jobs of ${name}-main.yml differ from the jobs of ${name}.yml`];
}

function readJobs(text: string): string {
  const start = text.indexOf('\njobs:\n');

  return start === -1 ? '' : text.slice(start);
}
