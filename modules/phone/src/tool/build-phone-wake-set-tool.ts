import { withWriteTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';
import {
  formatDurationText,
  pickWakeTiming,
  resolveWakeTarget,
  setWakeRuleInTransaction,
} from '@heynixie/triggers';
import { z } from 'zod';
import { phoneDeclarations } from '../connector/phone-declarations';
import { phoneToolNames } from '../connector/phone-tool-names';
import { phoneSourceID } from '../source/phone-source-id';
import { readTextPage } from '../store/read-text-page';
import type { PhoneContext } from '../types';
import { renderOutsideText } from './render-outside-text';

const recentMs = 10 * 60_000;
const durationPattern = '^[1-9][0-9]*(ms|s|m|h|d)$';

const inputSchema = z.strictObject({
  from: z.array(z.string().min(1)).min(1).exactOptional(),
  body: z.string().min(1).exactOptional(),
  wake: z.string().exactOptional(),
  expires: z.string().exactOptional(),
  window: z.string().exactOptional(),
});

// phone.wake_set: sets a wake rule on the assistant's own phone. All texts are silent until a rule
// matches one. A rule wakes the conversation or any task, which the call names. The result's recent
// texts are outside content, and the call's record keeps their IDs and times alone.
export function buildPhoneWakeSetTool(context: PhoneContext): ToolDefinition {
  return {
    name: phoneToolNames.wakeSet,
    description:
      'Sets a wake rule on your own phone: a text is silent until a rule matches it. The rule ' +
      'wakes the conversation or a task when a text matches from (numbers in E.164 form, or ' +
      'sender names) and body (a word), and stays until expires passes, or until you cancel it ' +
      'when you give no expires. A match wakes its target at once, unless the rule woke it ' +
      'within its window, and then it waits and arrives with the later ones in one wake. wake ' +
      'names the target: conversation or a task ID, and it defaults to you. Set the rule before ' +
      'you ask a site for a code, and give a short window when you wait on one. Anyone can send a ' +
      'text under any sender name, so a sender name proves nothing. The rule never matches a text ' +
      'that came before it, so recent lists the last 10 minutes of texts that it takes.',
    input: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
        body: { type: 'string', minLength: 1 },
        wake: { type: 'string', description: 'conversation, or the ID of a task' },
        expires: {
          type: 'string',
          pattern: durationPattern,
          description: 'from 1m, such as 30m or 7d; none stays',
        },
        window: {
          type: 'string',
          pattern: durationPattern,
          description: 'from 1m, such as 1m or 15m; at most expires',
        },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        rule: { type: 'string' },
        expiresAt: { type: ['string', 'null'] },
        window: { type: 'string' },
        replaced: { type: 'boolean' },
        recent: { type: 'array', items: { type: 'object' } },
      },
      required: ['rule', 'expiresAt', 'window', 'replaced', 'recent'],
      additionalProperties: false,
    },
    declaration: phoneDeclarations.wakeSet,
    execution: 'direct',
    run: async (call, toolContext) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;
      const now = context.clock.now();

      const timing = pickWakeTiming({
        expires: input.expires,
        window: input.window,
        nowMs: now,
        defaultWindowMs: context.settings.wake.window,
      });

      if (timing.status === 'bad') {
        return {
          status: 'error',
          message:
            'BAD_DURATION: expires and window take a duration such as 1m, 30m or 7d, from 1m, and ' +
            'the window is at most the expiry',
        };
      }

      const resolved = await resolveWakeTarget(context.log, toolContext.run.thread, input.wake);

      if (resolved.status === 'refused') {
        return { status: 'error', message: resolved.message };
      }

      const match = {
        ...(input.from === undefined ? {} : { from: input.from }),
        ...(input.body === undefined ? {} : { body: input.body }),
      };

      const rule = await withWriteTransaction(context.log.writer, (tx) =>
        setWakeRuleInTransaction(tx, context, {
          mailbox: { kind: 'source', sourceID: phoneSourceID },
          match,
          target: resolved.target,
          setBy: toolContext.run.thread === '' ? conversationTaskID : toolContext.run.thread,
          expiresAt: timing.expiresAt,
          windowMs: timing.windowMs,
          origin: 'tool',
        }),
      );

      const recent = await readTextPage(context, { limit: 20, sinceMs: now - recentMs, match });

      const settled = {
        rule: rule.shortID,
        expiresAt: timing.expiresAt === null ? null : new Date(timing.expiresAt).toISOString(),
        window: formatDurationText(rule.windowMs),
        replaced: rule.replaced,
      };

      return {
        status: 'ok',
        result: {
          ...settled,
          recent: recent.texts.map((text) => ({
            text: text.text,
            from: renderOutsideText(text.from),
            body: renderOutsideText(text.body),
            at: text.at,
          })),
        },
        record: {
          ...settled,
          recent: recent.texts.map((text) => ({ text: text.text, at: text.at })),
        },
      };
    },
  };
}
