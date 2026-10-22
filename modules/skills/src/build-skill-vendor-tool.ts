import type {
  DefinitionsRepo,
  ParseProblem,
  ParsedSkill,
  SkillDocument,
} from '@heynixie/definitions';
import {
  buildSkillVendorChange,
  checkSkillFiles,
  defaultSizeLimits,
  manifestPath,
  parseSkillFrontmatter,
  skillsLockPath,
} from '@heynixie/definitions';
import type { RunCheck } from '@heynixie/sessions';
import type { ToolCall, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { parseSkillVendorInput } from './parse-skill-vendor-input';
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

  const instructions = read.skill.files.find((file) => file.path === 'SKILL.md');

  const document =
    instructions === undefined
      ? null
      : parseSkillFrontmatter(instructions.text.replaceAll('\r\n', '\n'));

  if (document === null || !isSkillDocument(document)) {
    return {
      status: 'error',
      message: `${input.source.path} holds no SKILL.md with valid frontmatter, so it is no skill`,
    };
  }

  const name = document.frontmatter.name;
  const checked = checkSkillFiles(name, read.skill.files);

  if (isProblemList(checked)) {
    return { status: 'error', message: renderProblems(checked) };
  }

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

function isSkillDocument(document: SkillDocument | readonly string[]): document is SkillDocument {
  return !Array.isArray(document);
}

function isProblemList(
  checked: ParsedSkill | readonly ParseProblem[],
): checked is readonly ParseProblem[] {
  return Array.isArray(checked);
}

function renderProblems(problems: readonly ParseProblem[]): string {
  const lines = problems.map((problem) => `${problem.path}: ${problem.reason}`);

  return `the skill fails the checks the seed runs, so nixie cannot vendor it:\n${lines.join('\n')}`;
}
