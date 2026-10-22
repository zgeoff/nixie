import type { DefinitionsRepo } from '@heynixie/definitions';
import {
  buildSkillVendorChange,
  defaultSizeLimits,
  manifestPath,
  skillsLockPath,
} from '@heynixie/definitions';
import type { RunCheck } from '@heynixie/sessions';
import type { ToolCall, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { parseSkillVendorInput } from './parse-skill-vendor-input';
import { parseVendoredSkill } from './parse-vendored-skill';
import type { ReadPage } from './read-github-skill';
import { readGitHubSkill } from './read-github-skill';
import { renderSkillVendorReport } from './render-skill-vendor-report';
import { runSkillVendorReview } from './run-skill-vendor-review';

export interface SkillVendorContext {
  readonly readPage: ReadPage;
  readonly repo: DefinitionsRepo;

  readonly readReviewer: () => RunCheck | null;
}

export function buildSkillVendorTool(context: SkillVendorContext): ToolDefinition {
  return {
    name: 'skill_vendor',
    description:
      "Opens a pull request on the owner's definitions repo that adds a published skill from a " +
      'public GitHub repository, pinned at one commit, with its lock entry and a review report. ' +
      "Give the repository URL, the path of the skill's folder, and the full 40-character commit " +
      'SHA; a branch, a tag or a short SHA is refused. review asks a model for an advisory ' +
      'reading in the report. The skill applies only after the owner merges the pull request.',
    input: {
      type: 'object',
      properties: {
        repository: {
          type: 'string',
          description:
            'the https URL of the GitHub repository, such as https://github.com/example/skills',
        },
        path: {
          type: 'string',
          description: "the path of the skill's folder in the repository, such as skills/pdf-forms",
        },
        commit: { type: 'string', description: 'the full 40-character commit SHA to pin' },
        review: {
          type: 'boolean',
          description: 'true to add an advisory model review to the report',
        },
      },
      required: ['repository', 'path', 'commit'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        contentHash: { type: 'string' },
        pullRequest: { type: 'string' },
      },
      required: ['name', 'contentHash', 'pullRequest'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['fetch'],
      destinations: ['repository'],
      amount: null,
      content: [],
      results: { name: 'untrusted', contentHash: 'owner_data', pullRequest: 'owner_data' },
    },
    execution: 'direct',
    run: (call) => runSkillVendor(context, call),
  };
}

async function runSkillVendor(context: SkillVendorContext, call: ToolCall): Promise<ToolOutcome> {
  const input = parseSkillVendorInput(call.input);

  if (input.status === 'refused') {
    return { status: 'error', message: input.reason };
  }

  const reviewer = call.input['review'] === true ? context.readReviewer() : null;

  if (call.input['review'] === true && reviewer === null) {
    return {
      status: 'error',
      message: 'no review model runs in this deployment, so call again without review',
    };
  }

  const read = await readGitHubSkill(context.readPage, input.source, defaultSizeLimits);

  if (read.status === 'refused') {
    return { status: 'error', message: read.reason };
  }

  const parsed = parseVendoredSkill(input.source.path, read.skill.files);

  if (parsed.status === 'refused') {
    return { status: 'error', message: parsed.reason };
  }

  const checked = parsed.skill;
  const name = checked.name;
  const review = reviewer === null ? null : await runSkillVendorReview(reviewer, checked.files);

  const report = renderSkillVendorReport({
    files: checked.files,
    frontmatter: checked.frontmatter,
    signature: read.skill.signature,
    skipped: read.skill.skipped,
    review,
  });

  const revision = await context.repo.readBaseRevision();

  const vendored = buildSkillVendorChange({
    version: checked,
    entry: {
      source: input.source.repository,
      path: input.source.path,
      commit: input.source.commit,
    },
    report,
    existing: await context.repo.readFolder(`skills/${name}`, revision),
    sizes: await context.repo.readFileSizes(revision),
    lock: await context.repo.readFile(skillsLockPath, revision),
    manifest: await context.repo.readFile(manifestPath, revision),
  });

  if (vendored.status === 'refused') {
    return { status: 'error', message: vendored.reason };
  }

  const pullRequest = await context.repo.writePullRequest(vendored.change, revision);

  return {
    status: 'ok',
    result: { name, contentHash: checked.skillHash, pullRequest: pullRequest.url },
  };
}
