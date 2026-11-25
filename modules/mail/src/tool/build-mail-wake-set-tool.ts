import { withWriteTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';
import { setWakeRuleInTransaction } from '@heynixie/triggers';
import { z } from 'zod';
import { mailDeclarations } from '../connector/mail-declarations';
import { mailToolNames } from '../connector/mail-tool-names';
import { readMailPage } from '../store/read-mail-page';
import type { MailToolContext } from '../types';
import { formatDurationText } from './format-duration-text';
import { pickWakeTiming } from './pick-wake-timing';
import { renderOutsideText } from './render-outside-text';
import { resolveWakeTarget } from './resolve-wake-target';

const recentMs = 10 * 60_000;
const durationPattern = '^[1-9][0-9]{0,6}(ms|s|m|h|d)$';
const addressPattern = String.raw`^(@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$`;

const inputSchema = z.strictObject({
  from: z.array(z.string()).exactOptional(),
  subject: z.string().exactOptional(),
  thread: z.string().exactOptional(),
  wake: z.string().exactOptional(),
  expires: z.string().exactOptional(),
  window: z.string().exactOptional(),
});

// mail.wake_set: sets a wake rule on the assistant's own mailbox. All mail is silent until a rule
// matches it. A rule wakes the conversation or any task, which the call names.
export function buildMailWakeSetTool(context: MailToolContext): ToolDefinition {
  return {
    name: mailToolNames.wakeSet,
    description:
      'Sets a wake rule on your own mailbox: mail is silent until a rule matches it. The rule ' +
      'wakes the conversation or a task when a mail matches from (addresses, or @domain), ' +
      'subject (a word) or thread, and stays until expires passes, or until you cancel it when ' +
      'you give no expires. A match wakes its target at once, unless the rule woke it within its ' +
      'window, and then it waits and arrives with the later ones in one wake. wake names the ' +
      'target: conversation or a task ID, and it defaults to you. Set the rule before you ask a ' +
      'site for a code, and give a short window when you wait on one. The rule never matches a ' +
      'mail that came before it, so recent lists the last 10 minutes of mail that it takes.',
    input: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'string', pattern: addressPattern }, minItems: 1 },
        subject: { type: 'string', minLength: 1 },
        thread: { type: 'string', description: 'a thread ID from mail.list' },
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
    declaration: mailDeclarations.wakeSet,
    execution: 'direct',
    run: async (call, toolContext) => {
      const parsed = inputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: `BAD_ADDRESS: ${z.prettifyError(parsed.error)}` };
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
            'BAD_DURATION: expires and window take a duration such as 1m, 30m or 7d, from 1m, ' +
            'and the window is at most the expiry',
        };
      }

      const resolved = await resolveWakeTarget(context.log, toolContext.run.thread, input.wake);

      if (resolved.status === 'refused') {
        return { status: 'error', message: resolved.message };
      }

      const expiresAt = timing.expiresAt;

      const match = {
        ...(input.from === undefined ? {} : { from: input.from }),
        ...(input.subject === undefined ? {} : { subject: input.subject }),
        ...(input.thread === undefined ? {} : { thread: input.thread }),
      };

      const rule = await withWriteTransaction(context.log.writer, (tx) =>
        setWakeRuleInTransaction(tx, context, {
          mailbox: { kind: 'mail' },
          match,
          target: resolved.target,
          setBy: toolContext.run.thread === '' ? conversationTaskID : toolContext.run.thread,
          expiresAt,
          windowMs: timing.windowMs,
          origin: 'tool',
        }),
      );

      const recent = await readMailPage(context, {
        limit: 20,
        sinceMs: now - recentMs,
        match,
      });

      const recentMails = recent.mails.map((mail) => ({
        message: mail.message,
        thread: mail.thread,
        from: mail.from,
        subject: mail.subject,
        at: mail.at,
        unread: mail.unread,
      }));

      const settled = {
        rule: rule.shortID,
        expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
        window: formatDurationText(rule.windowMs),
        replaced: rule.replaced,
      };

      return {
        status: 'ok',
        result: {
          ...settled,
          recent: recentMails.map((mail) => ({
            ...mail,
            from: renderOutsideText(mail.from),
            subject: renderOutsideText(mail.subject),
          })),
        },
        record: { ...settled, recent: recentMails },
      };
    },
  };
}
