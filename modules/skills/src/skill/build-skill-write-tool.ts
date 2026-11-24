import { createShortID } from '@heynixie/db';
import type { DefinitionsInForce, ParseProblem, ParsedSkill } from '@heynixie/definitions';
import { checkSkillFiles, loadSkillVersions } from '@heynixie/definitions';
import { writeRecords } from '@heynixie/log';
import { checkUntypedToken, defaultGateLimits } from '@heynixie/memory';
import type { ToolCall, ToolContext, ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { addRelatedMemory, relatedMemoryOutput } from '@heynixie/tools';
import { z } from 'zod';
import type { SkillToolsContext } from '../types';
import { skillsWriteProposedCodec } from '../write/skills-write-proposed-codec';
import { writeRuleAppliedSkill } from './write-rule-applied-skill';

const writeArguments = z.object({
  name: z.string(),
  files: z.object({ path: z.string(), text: z.string() }).array(),
});

export function buildSkillWriteTool(context: SkillToolsContext): ToolDefinition {
  return {
    name: 'skill_write',
    description:
      'Writes a skill: a new skill, or a new version of one, with its complete set of files. ' +
      'SKILL.md opens with YAML frontmatter that holds the name and a description of when to use ' +
      "the skill. When an allow rule of the owner's names skill_write, the write applies at once " +
      'and the skill is in force for new tasks. Otherwise, or when the files hold a destination ' +
      'the owner never typed, the write becomes a proposal that the owner reviews. When memory ' +
      'holds active items close to the skill, `related` lists them with their IDs and text.',
    input: {
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
    },
    output: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['applied', 'pending'] },
        proposalID: { type: 'string' },
        message: { type: 'string' },
        related: relatedMemoryOutput,
      },
      required: ['status', 'message'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        status: 'owner_data',
        proposalID: 'owner_data',
        message: 'owner_data',
        related: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, tool) => {
      const outcome = await runSkillWrite(context, call, tool);

      const input = writeArguments.parse(call.input);

      return addRelatedMemory(outcome, context.relatedMemory, {
        callID: call.callID,
        text: [input.name, ...input.files.map((file) => file.text)].join('\n'),
      });
    },
  };
}

async function runSkillWrite(
  context: SkillToolsContext,
  call: ToolCall,
  tool: ToolContext,
): Promise<ToolOutcome> {
  const run = tool.run;
  const input = writeArguments.parse(call.input);
  const name = input.name;
  const files = input.files;
  const inForce = context.readInForce();

  if (inForce === null) {
    return { status: 'error', message: 'no definitions are in force yet' };
  }

  const checked = checkSkillFiles(name, files);

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

  const token = await checkUntypedToken(context.log, {
    thread: run.thread,
    limit: defaultGateLimits.evidenceWindow,
    text: [...skill.files.values()].join('\n'),
    ownText,
  });

  const definitions = {
    snapshotHash: inForce.snapshotHash,
    personaVersion: inForce.personaVersion,
  };

  const provenance = { runID: run.runID, callID: call.callID, profile: run.model.profile };
  const [rule] = tool.namingRules ?? [];
  const baseHash = base?.skillHash ?? null;

  // the token check holds under every rule, so a skill that names an untyped destination waits
  if (rule !== undefined && token === null) {
    const isApplied = await writeRuleAppliedSkill(context.log, {
      writeID: createShortID(),
      skill,
      baseHash,
      rule,
      thread: run.thread,
      definitions,
      provenance,
      at: context.clock.now(),
    });

    if (isApplied) {
      await context.runInForceSeed();

      return {
        status: 'ok',
        result: {
          status: 'applied',
          message:
            `applied ${name} under the rule ${rule.id}; it is in force for new tasks. Call ` +
            `skill_reload with ${name} to use it in this conversation.`,
        },
      };
    }
  }

  const proposalID = createShortID();

  await writeRecords(context.log, [
    {
      kind: 'skills.write_proposed',
      thread: run.thread,
      definitions,
      payload: skillsWriteProposedCodec.encode({
        proposalID,
        name,
        skillHash: skill.skillHash,
        baseHash,
        files: [...skill.files].map(([path, text]) => ({ path, text })),
        untypedToken: token === null ? null : { kind: token.kind, raw: token.raw },
        provenance,
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

async function readOwnText(
  context: SkillToolsContext,
  inForce: DefinitionsInForce,
): Promise<string> {
  const versions = await loadSkillVersions(
    context.log.writer.db,
    inForce.skills.map((skill) => skill.skillHash),
  );

  const texts = [...versions.values()].flatMap((version) => version.files.values().toArray());

  return [inForce.persona, ...texts].join('\n');
}
