import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { endWakeRuleInTransaction, readWakeRules } from '@heynixie/triggers';
import { z } from 'zod';
import { mailDeclarations } from '../connector/mail-declarations';
import { mailToolNames } from '../connector/mail-tool-names';
import type { MailContext } from '../types';

const inputSchema = z.strictObject({ rule: z.string() });

// mail.wake_cancel: ends any live rule of the assistant's own mailbox. The matches that it held
// still arrive in a later wake.
export function buildMailWakeCancelTool(context: MailContext): ToolDefinition {
  return {
    name: mailToolNames.wakeCancel,
    description:
      'Cancels a wake rule of your own mailbox, whoever set it. Mail that the rule already held ' +
      'still arrives in one later wake, and no later mail matches it.',
    input: {
      type: 'object',
      properties: { rule: { type: 'string', description: 'a rule ID from mail.wake_list' } },
      required: ['rule'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { rule: { type: 'string' }, ended: { type: 'boolean' } },
      required: ['rule', 'ended'],
      additionalProperties: false,
    },
    declaration: mailDeclarations.wakeCancel,
    execution: 'direct',
    run: async (call) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const rules = await readWakeRules(context.log.writer.db, {
        mailbox: { kind: 'mail' },
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
