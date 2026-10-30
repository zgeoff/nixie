import { appendFileSync } from 'node:fs';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { writeStepValues } from '../lib/write-step-values.ts';

// The attestations take the source commit from the run, so the run's commit must be the release
// commit: a manual run starts on the release tag, and a push run is the commit release-please
// tagged.
function runCLI(): void {
  const command = parseStepCommand('resolve-release.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const sha = getStepEnv(process.env, 'GITHUB_SHA');

  const resolved = pickReleaseTag({
    eventName: getStepEnv(process.env, 'GITHUB_EVENT_NAME'),
    refType: getStepEnv(process.env, 'GITHUB_REF_TYPE'),
    refName: getStepEnv(process.env, 'GITHUB_REF_NAME'),
    createdTag: getStepEnv(process.env, 'CREATED_TAG'),
    createdSHA: getStepEnv(process.env, 'CREATED_SHA'),
    sha,
  });

  if (!resolved.isValid) {
    console.log(`::error::${resolved.error}`);

    process.exitCode = 1;

    return;
  }

  writeStepValues(getStepEnv(process.env, 'GITHUB_OUTPUT'), {
    tag: resolved.tag,
    version: resolved.tag.slice(1),
    sha,
  });

  appendFileSync(
    getStepEnv(process.env, 'GITHUB_STEP_SUMMARY'),
    `Releasing ${resolved.tag} from ${sha}\n`,
  );
}

interface ReleaseRun {
  readonly eventName: string;
  readonly refType: string;
  readonly refName: string;
  readonly createdTag: string;
  readonly createdSHA: string;
  readonly sha: string;
}

type ResolvedRelease =
  | { readonly isValid: true; readonly tag: string }
  | { readonly isValid: false; readonly error: string };

const releaseTagPattern = /^v\d+\.\d+\.\d+$/u;

function pickReleaseTag(run: Readonly<ReleaseRun>): ResolvedRelease {
  if (run.eventName === 'workflow_dispatch' && run.refType !== 'tag') {
    return {
      isValid: false,
      error: 'start a manual run on a release tag: gh workflow run release.yml --ref v<version>',
    };
  }

  if (run.eventName !== 'workflow_dispatch' && run.createdSHA !== run.sha) {
    return {
      isValid: false,
      error: `release-please tagged ${run.createdSHA}, not this run's commit ${run.sha}. Rebuild with: gh workflow run release.yml --ref ${run.createdTag}`,
    };
  }

  const tag = run.eventName === 'workflow_dispatch' ? run.refName : run.createdTag;

  if (!releaseTagPattern.test(tag)) {
    return {
      isValid: false,
      error: `${tag} is not a release tag of the form v<major>.<minor>.<patch>`,
    };
  }

  return { isValid: true, tag };
}

if (import.meta.main) {
  runCLI();
}
