import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { endWakeRuleInTransaction, readWakeRules } from '@heynixie/triggers';
import { z } from 'zod';
import { phoneDeclarations } from '../connector/phone-declarations';
import { phoneToolNames } from '../connector/phone-tool-names';
import { phoneSourceID } from '../source/phone-source-id';
import type { PhoneContext } from '../types';

const inputSchema = z.strictObject({ rule: z.string() });

// phone.wake_cancel: ends any live rule of the assistant's own phone. The matches that it held
// still arrive in a later wake.
export function buildPhoneWakeCancelTool(context: PhoneContext): ToolDefinition {
  return {
    name: phoneToolNames.wakeCancel,
    description:
      'Cancels a wake rule of your own phone, whoever set it. Texts that the rule already held ' +
      'still arrive in one later wake, and no later text matches it.',
    input: {
      type: 'object',
      properties: { rule: { type: 'string', description: 'a rule ID from phone.wake_list' } },
      required: ['rule'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { rule: { type: 'string' }, ended: { type: 'boolean' } },
      required: ['rule', 'ended'],
      additionalProperties: false,
    },
    declaration: phoneDeclarations.wakeCancel,
    execution: 'direct',
    run: async (call) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const rules = await readWakeRules(context.log.writer.db, {
        mailbox: { kind: 'source', sourceID: phoneSourceID },
        at: context.clock.now(),
      });

      const rule = rules.find((entry) => entry.shortID === parsed.data.rule);

      if (rule === undefined) {
        return {
          status: 'error',
          message: `UNKNOWN_RULE: no live rule has the ID ${parsed.data.rule}`,
        };
      }

      await withWriteTransaction(context.log.writer, (tx) =>
        endWakeRuleInTransaction(tx, context, rule.ruleID, 'cancelled'),
      );

      return { status: 'ok', result: { rule: rule.shortID, ended: true } };
    },
  };
}
