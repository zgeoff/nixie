import { createShortID } from '@heynixie/db';
import type { DefinitionsInForce, ParseProblem, ParsedSkill } from '@heynixie/definitions';
import { checkSkillFiles, findSkillVersions } from '@heynixie/definitions';
import { writeRecords } from '@heynixie/log';
import { defaultGateLimits, findUntypedToken } from '@heynixie/memory';
import type { ToolCall, ToolDefinition, ToolOutcome, ToolRun } from '@heynixie/tools';
import { z } from 'zod';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';
import type { SkillToolsContext } from './types';

const writeInput = {
  type: 'object',
  properties: {
    name: { type: 'string', description: "the skill's name, which its folder takes" },
    files: {
      type: 'array',
      minItems: 1,
      description:
        "every file of the skill, SKILL.md included, by its path inside the skill's folder",
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, text: { type: 'string' } },
        required: ['path', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'files'],
  additionalProperties: false,
};

const writeOutput = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pending'] },
    proposalID: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['status', 'proposalID', 'message'],
  additionalProperties: false,
};

// Builds skill_write, which declares note and proposes a new skill, or a new version of one, for
// your review. The seed checks run first, and a skill that fails one returns its problems. The
// proposal holds the files, the replaced version, the token check and the run that wrote it.
export function buildSkillWriteTool(context: SkillToolsContext): ToolDefinition {
  return {
    name: 'skill_write',
    description:
      'Proposes a skill for the owner to review: a new skill, or a new version of one, with its ' +
      'complete set of files. SKILL.md opens with YAML frontmatter that holds the name and a ' +
      'description of when to use the skill. The owner approves each proposal before the skill ' +
      'runs anywhere.',
    input: writeInput,
    output: writeOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { status: 'owner_data', proposalID: 'owner_data', message: 'owner_data' },
    },
    execution: 'direct',
    run: (call, tool) => runSkillWrite(context, call, tool.run),
  };
}

// the input as the input schema accepted it
const writeArguments = z.object({
  name: z.string(),
  files: z.object({ path: z.string(), text: z.string() }).array(),
});

async function runSkillWrite(
  context: SkillToolsContext,
  call: ToolCall,
  run: ToolRun,
): Promise<ToolOutcome> {
  const input = writeArguments.parse(call.input);
  const name = input.name;
  const files = input.files;
  const inForce = context.readInForce();

  if (inForce === null) {
    return { status: 'error', message: 'no definitions are in force yet' };
  }

  const checked = checkSkillFiles(name, new Map(files.map((file) => [file.path, file.text])));

  if (isProblemList(checked)) {
    const problems = checked.map((problem) => `${problem.path}: ${problem.reason}`);

    return { status: 'error', message: `the skill fails the seed checks: ${problems.join('; ')}` };
  }

  const skill = checked;
  const base = inForce.skills.find((candidate) => candidate.name === name) ?? null;

  if (base?.skillHash === skill.skillHash) {
    return { status: 'error', message: `the files match the version of ${name} in force` };
  }

  const ownText = await readOwnText(context, inForce);

  const token = await findUntypedToken(context.log, {
    thread: run.thread,
    limit: defaultGateLimits.evidenceWindow,
    text: [...skill.files.values()].join('\n'),
    ownText,
  });

  const proposalID = createShortID();

  await writeRecords(context.log, [
    {
      kind: 'skills.write_proposed',
      thread: run.thread,
      definitions: { snapshotHash: inForce.snapshotHash, personaVersion: inForce.personaVersion },
      payload: skillsWriteProposedCodec.encode({
        proposalID,
        name,
        skillHash: skill.skillHash,
        baseHash: base?.skillHash ?? null,
        files: [...skill.files].map(([path, text]) => ({ path, text })),
        untypedToken: token === null ? null : { kind: token.kind, raw: token.raw },
        provenance: { runID: run.runID, callID: call.callID, profile: run.model.profile },
      }),
    },
  ]);

  return {
    status: 'ok',
    result: { status: 'pending', proposalID, message: `pending approval as ${proposalID}` },
  };
}

function isProblemList(
  checked: ParsedSkill | readonly ParseProblem[],
): checked is readonly ParseProblem[] {
  return Array.isArray(checked);
}

// the text of your definitions in force: the persona and every skill's files
async function readOwnText(
  context: SkillToolsContext,
  inForce: DefinitionsInForce,
): Promise<string> {
  const versions = await findSkillVersions(
    context.log.writer.db,
    inForce.skills.map((skill) => skill.skillHash),
  );

  const texts = [...versions.values()].flatMap((version) => version.files.values().toArray());

  return [inForce.persona, ...texts].join('\n');
}
