import { readMessageTimeZone } from '@heynixie/connectors';
import { mandateInputSchema, writeMandateProposal } from '@heynixie/definitions';
import { withWriteTransaction } from '@heynixie/log';
import type { ProposalContext } from '@heynixie/proposals';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';

export const mandateToolName = 'rules.propose_mandate';
const jsonSchema = z.toJSONSchema(mandateInputSchema, { io: 'input', target: 'draft-2020-12' });
const inputSchema = z.record(z.string(), z.json()).parse(structuredClone(jsonSchema));

export interface MandateToolOptions {
  readonly context: ProposalContext;
  readonly maxHours: number;
  readonly defaultZone: string;
}

// Declares note, because its call only writes a proposal that the owner answers on a card. The
// conversation holds it alone, so no task or job can call it.
export function buildMandateTool(options: MandateToolOptions): ToolDefinition {
  const context = options.context;

  return {
    name: mandateToolName,
    description:
      'Proposes a mandate: allow rules that last until a set time and then end on their own, such ' +
      'as full authority over calendar invites today. The owner approves it on a card before any ' +
      'rule takes effect.',
    input: inputSchema,
    output: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        proposalID: { type: 'string' },
        mandateID: { type: 'string' },
        expires: { type: 'string' },
        sentences: { type: 'array', items: { type: 'string' } },
      },
      required: ['status', 'proposalID', 'mandateID', 'expires', 'sentences'],
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
          context,
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
        return { status: 'error', message: `The mandate was refused: ${proposed.reason}.` };
      }

      return {
        status: 'ok',
        result: {
          status: 'pending',
          proposalID: proposed.shortID,
          mandateID: proposed.mandateID,
          expires: new Date(proposed.expires).toISOString(),
          sentences: [...proposed.sentences],
        },
      };
    },
  };
}
