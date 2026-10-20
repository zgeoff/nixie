import { formatAge } from '@heynixie/clock';
import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { readPendingSkillProposals } from './read-pending-skill-proposals';
import type { PendingSkillProposal, SkillToolsContext } from './types';

const pendingOutput = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          proposalID: { type: 'string' },
          name: { type: 'string', description: 'the skill the proposal writes' },
          change: {
            type: 'string',
            enum: ['new', 'new_version'],
            description:
              'new for a skill not in force, new_version for one that replaces a version',
          },
          version: {
            type: 'string',
            description: 'the content hash of the version a new_version replaces',
          },
          age: { type: 'string', description: 'how long it has waited, such as 3 days' },
        },
        required: ['proposalID', 'name', 'change', 'age'],
        additionalProperties: false,
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
};

// Builds skill_pending, which declares read and lists every skill proposal that still waits for
// your answer, oldest first. It never answers one. The model wrote each proposal's name, which can
// quote anything it read, so the result takes the most cautious source.
export function buildSkillPendingTool(context: SkillToolsContext): ToolDefinition {
  return {
    name: 'skill_pending',
    description:
      "Lists every skill proposal that still waits for the owner's answer, oldest first: its ID, " +
      'the skill it names, whether it is a new skill or a new version of one, and how long it has ' +
      'waited. Read it before you propose a skill, so you never propose one that already waits. ' +
      'Only the owner approves or rejects a proposal.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: pendingOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { proposals: 'untrusted' },
    },
    execution: 'direct',
    run: async () => {
      const pending = await readPendingSkillProposals(context);

      const now = context.clock.now();

      return {
        status: 'ok',
        result: { proposals: pending.map((entry) => toPendingJSON(entry, now)) },
        record: { proposals: pending.map((entry) => ({ proposalID: entry.proposal.proposalID })) },
      };
    },
  };
}

// the proposal as the model reads it, with the version it replaces when it replaces one
function toPendingJSON(entry: PendingSkillProposal, now: number): JSONObject {
  const proposal = entry.proposal;

  return {
    proposalID: proposal.proposalID,
    name: proposal.name,
    ...(proposal.baseHash === null
      ? { change: 'new' }
      : { change: 'new_version', version: proposal.baseHash }),
    age: formatAge(now - entry.proposedAt),
  };
}
