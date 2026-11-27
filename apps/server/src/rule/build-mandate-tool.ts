import { readMessageTimeZone } from '@heynixie/connectors';
import { mandateInputSchema, writeMandateProposal } from '@heynixie/definitions';
import type { MandateRefusal } from '@heynixie/definitions';
import { withWriteTransaction } from '@heynixie/log';
import { listUncoveredMemoryWrites } from '@heynixie/policy';
import type { ProposalConfig, ProposalContext } from '@heynixie/proposals';
import type { ToolDefinition } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { memoryRuleArguments } from './memory-rule-arguments';

export const mandateToolName = 'rules.propose_mandate';
const jsonSchema = z.toJSONSchema(mandateInputSchema, { io: 'input', target: 'draft-2020-12' });
const inputSchema = z.record(z.string(), z.json()).parse(structuredClone(jsonSchema));

const memoryArgumentLines = Object.entries(memoryRuleArguments)
  .map(([tool, names]) => `${tool}: ${names.join(', ')}`)
  .join('; ');

// The text that tells the model how a rule reaches the memory writes. The arguments in it are the
// ones that the memory tools declare, which a test checks against their input schemas.
export function buildMandateDescription(maxHours: number): string {
  return (
    'Proposes a mandate: allow rules that last until a set time and then end on their own, such ' +
    'as full authority over calendar invites today. The owner approves it on a card before any ' +
    'rule takes effect. ' +
    `A mandate lasts at most ${maxHours} hours from the proposal. With no expires, it ends at the ` +
    "next midnight in the user's time zone. " +
    'For memory, a rule by tool name (memory.remember, memory.edit, memory.retire, memory.pin) and ' +
    'a rule by effect (memory_write) cover the same writes, and an allow rule that covers a write ' +
    'applies it at once with a notice; a write that no rule covers waits for review. A rule that ' +
    'covers memory.edit also covers memory.retopic, which re-files a topic or a list of items. A rule that ' +
    'checks no subject leaves self-notes uncovered: add a check that subject is self to cover ' +
    'them. A write from a photo needs a check on an image argument. memory.unpin has the note ' +
    'effect, so only a rule by its tool name reaches it. The arguments that a rule can check, by ' +
    `tool: ${memoryArgumentLines}. ` +
    'Example for memory tidy-up: one rule with tools memory.edit, memory.retire and memory.pin, ' +
    'and one rule with tools memory.remember and memory.edit and a check that subject eq self. ' +
    'A rule may carry a cel condition and then needs a note that says what the condition means in a sentence. ' +
    'The condition reads tool, effects, context, definition, args (the call input, without the free-text content arguments), destinations, sources and now, ' +
    'and may use comparisons, && || !, in, size, has, startsWith, endsWith, contains, lowerAscii, exists and all on a list, and the timestamp methods ' +
    'getHours, getMinutes, getDayOfWeek, getDate, getMonth and getFullYear with a zone string, such as now.getHours("Europe/London") < 17. ' +
    'A condition that reads a missing argument errors, and the call then asks. ' +
    'The result lists in memoryGaps the memory writes that each rule will not cover.'
  );
}

export interface MandateToolOptions {
  readonly context: ProposalContext;
  readonly proposalConfig?: ProposalConfig | undefined;
  readonly maxHours: number;
  readonly defaultZone: string;
}

// Declares note, because its call only writes a proposal that the owner answers on a card. The
// conversation holds it alone, so no task or job can call it.
export function buildMandateTool(options: MandateToolOptions): ToolDefinition {
  const context = options.context;

  return {
    name: mandateToolName,
    description: buildMandateDescription(options.maxHours),
    input: inputSchema,
    output: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        proposalID: { type: 'string' },
        mandateID: { type: 'string' },
        expires: { type: 'string' },
        sentences: { type: 'array', items: { type: 'string' } },
        memoryGaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rule: { type: 'integer' },
              uncovered: { type: 'array', items: { type: 'string' } },
            },
            required: ['rule', 'uncovered'],
            additionalProperties: false,
          },
        },
      },
      required: ['status', 'proposalID', 'mandateID', 'expires', 'sentences', 'memoryGaps'],
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
        mandateID: 'owner_data',
        expires: 'owner_data',
        sentences: 'owner_data',
        memoryGaps: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = mandateInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const proposed = await withWriteTransaction(context.log.writer, (tx) =>
        writeMandateProposal(
          tx,
          { ...context, proposalConfig: options.proposalConfig },
          {
            maxHours: options.maxHours,
            readZone: async (reader) => {
              const zone = await readMessageTimeZone({
                writer: { ...context.log.writer, db: reader },
              });

              return zone ?? options.defaultZone;
            },
          },
          { input: parsed.data, proposedBy: 'nixie' },
        ),
      );

      if (proposed.status === 'refused') {
        return { status: 'error', message: formatRefusal(proposed) };
      }

      return {
        status: 'ok',
        result: {
          status: 'pending',
          proposalID: proposed.shortID,
          mandateID: proposed.mandateID,
          expires: new Date(proposed.expires).toISOString(),
          sentences: [...proposed.sentences],
          memoryGaps: parsed.data.rules.flatMap((rule, index) => {
            const uncovered = listUncoveredMemoryWrites(rule);

            return uncovered.length === 0 ? [] : [{ rule: index + 1, uncovered: [...uncovered] }];
          }),
        },
      };
    },
  };
}

function formatRefusal(refusal: MandateRefusal): string {
  return match(refusal)
    .with(
      { reason: 'invalid_condition' },
      (invalid) =>
        `The mandate was refused: ${invalid.faults.join('; ')}. Propose again with a condition inside the subset, and a note that says what it means.`,
    )
    .with(
      { reason: 'expires_past' },
      (past) =>
        `The mandate was refused: expires_past. now: ${past.now}. Propose again with expires after now, or leave expires out for the next midnight.`,
    )
    .with(
      { reason: 'expires_beyond_max' },
      (beyond) =>
        `The mandate was refused: expires_beyond_max. maxHours: ${beyond.maxHours}. latestExpiry: ${beyond.latestExpiry}. Propose again with expires at or before latestExpiry.`,
    )
    .exhaustive();
}
