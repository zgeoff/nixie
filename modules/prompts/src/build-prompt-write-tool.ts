import { createShortID } from '@heynixie/db';
import { writeRecords } from '@heynixie/log';
import type { ToolCall, ToolDefinition, ToolOutcome, ToolRun } from '@heynixie/tools';
import { z } from 'zod';
import { buildPromptOverrideHash } from './build-prompt-override-hash';
import { buildPromptProposalHash } from './build-prompt-proposal-hash';
import { promptIDs } from './prompt-ids';
import { promptPartFileSchema } from './prompt-proposal-schema';
import { promptsOverrideProposedCodec } from './prompts-override-proposed-codec';
import type { PromptToolsContext } from './types';

export function buildPromptWriteTool(context: PromptToolsContext): ToolDefinition {
  return {
    name: 'prompt_write',
    description:
      "Proposes an override of one of nixie's built-in prompts for the owner to review: the " +
      "prompt's entry in the prompts: map of nixie.yaml, the part files it reads, and the reason " +
      'for the change. A part file sits under prompts/ in the definitions. The owner approves, ' +
      'edits or rejects each proposal, and an approval opens a pull request to the definitions ' +
      'repo, so the override applies only after that pull request merges and live is promoted. ' +
      'Read the prompt with prompt_read first.',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', enum: [...promptIDs], description: 'the prompt to override' },
        entry: {
          type: 'object',
          description:
            "the prompt's entry in the prompts: map: each part to override, by name, mapped to the " +
            'path of its file, and _template mapped to the text of a template',
          additionalProperties: { type: 'string' },
        },
        files: {
          type: 'array',
          description: 'each part file the entry reads, by its path in the definitions',
          items: {
            type: 'object',
            properties: { path: { type: 'string' }, text: { type: 'string' } },
            required: ['path', 'text'],
            additionalProperties: false,
          },
        },
        reason: { type: 'string', description: 'why the prompt should change, for the owner' },
      },
      required: ['id', 'entry', 'files', 'reason'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending'] },
        proposalID: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['status', 'proposalID', 'message'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { status: 'owner_data', proposalID: 'owner_data', message: 'owner_data' },
    },
    execution: 'direct',
    run: (call, tool) => runPromptWrite(context, call, tool.run),
  };
}

const writeArguments = z.object({
  id: z.enum(promptIDs),
  entry: z.record(z.string(), z.string()),
  files: promptPartFileSchema.array(),
  reason: z.string(),
});

async function runPromptWrite(
  context: PromptToolsContext,
  call: ToolCall,
  run: ToolRun,
): Promise<ToolOutcome> {
  const input = writeArguments.parse(call.input);
  const inForce = context.readInForce();

  if (inForce === null) {
    return { status: 'error', message: 'no definitions are in force yet' };
  }

  const problems = context.checkProposal({
    id: input.id,
    entry: input.entry,
    files: input.files,
  });

  if (problems.length > 0) {
    const reasons = problems.map((problem) => `${problem.path}: ${problem.reason}`);

    return {
      status: 'error',
      message: `the override fails the definitions checks: ${reasons.join('; ')}`,
    };
  }

  if (input.reason.trim().length === 0) {
    return { status: 'error', message: 'a proposal needs a reason for the owner' };
  }

  const proposalID = createShortID();

  await writeRecords(context.log, [
    {
      kind: 'prompts.override_proposed',
      thread: run.thread,
      definitions: { snapshotHash: inForce.snapshotHash, personaVersion: inForce.personaVersion },
      payload: promptsOverrideProposedCodec.encode({
        proposalID,
        promptID: input.id,
        proposalHash: buildPromptProposalHash({
          promptID: input.id,
          entry: input.entry,
          files: input.files,
        }),
        baseHash: buildPromptOverrideHash(inForce.prompts[input.id]),
        entry: input.entry,
        files: input.files,
        reason: input.reason,
        provenance: { runID: run.runID, callID: call.callID, profile: run.model.profile },
      }),
    },
  ]);

  return {
    status: 'ok',
    result: { status: 'pending', proposalID, message: `pending approval as ${proposalID}` },
  };
}
