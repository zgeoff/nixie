import {
  sandboxImageKeys,
  sandboxImageRecords,
} from '../../modules/sandbox/src/sandbox-image-keys.ts';

// Lists each way that the release and Images workflows differ from the image keys and records: a
// key with no release job or no Images build step, a job or step that builds another image, and a
// key that the sandbox-manifest job does not need.
export function checkImageWorkflows(releaseText: string, imagesText: string): readonly string[] {
  const releaseJobs = parseJobs(releaseText);
  const imagesSteps = Object.values(parseJobs(imagesText)).flatMap((job) => job.steps ?? []);
  const needs = releaseJobs['sandbox-manifest']?.needs;
  const problems: string[] = [];

  for (const key of sandboxImageKeys) {
    const record = sandboxImageRecords[key];
    const job = releaseJobs[key];

    if (job === undefined) {
      problems.push(`the release workflow has no job for the image key ${key}`);
    } else {
      if (job.with?.['image'] !== record.repository) {
        problems.push(`the ${key} release job does not build the image ${record.repository}`);
      }

      if (job.with?.['dockerfile'] !== record.dockerfile) {
        problems.push(`the ${key} release job does not build ${record.dockerfile}`);
      }
    }

    if (!Array.isArray(needs) || !needs.includes(key)) {
      problems.push(`the sandbox-manifest job does not need the ${key} release job`);
    }

    const step = imagesSteps.find((candidate) => candidate.id === key);

    if (step === undefined) {
      problems.push(`the Images workflow has no build step with the id ${key}`);
    } else {
      const repository = step.with?.['repository'];

      if (typeof repository !== 'string' || !repository.endsWith(`/${record.repository}`)) {
        problems.push(`the ${key} Images step does not build the repository ${record.repository}`);
      }

      if (step.with?.['dockerfile'] !== record.dockerfile) {
        problems.push(`the ${key} Images step does not build ${record.dockerfile}`);
      }
    }
  }

  return problems;
}

interface WorkflowJob {
  readonly needs?: unknown;
  readonly with?: Readonly<Record<string, unknown>>;
  readonly steps?: readonly {
    readonly id?: unknown;
    readonly with?: Readonly<Record<string, unknown>>;
  }[];
}

function parseJobs(text: string): Readonly<Record<string, WorkflowJob>> {
  const workflow: unknown = Bun.YAML.parse(text);

  if (typeof workflow !== 'object' || workflow === null || !('jobs' in workflow)) {
    throw new Error('the workflow holds no jobs');
  }

  const jobs: unknown = workflow.jobs;

  if (typeof jobs !== 'object' || jobs === null) {
    throw new Error('the workflow holds no jobs');
  }

  return Object.fromEntries(Object.entries(jobs));
}
