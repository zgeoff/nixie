import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import {
  formatDurationText,
  pickWakeTiming,
  resolveWakeTarget,
  setWakeRuleInTransaction,
} from '@heynixie/triggers';
import { gmailDeclarations } from './gmail-declarations';
import { gmailToolNames } from './gmail-tool-names';
import { makeResolveGmailWakeInput } from './make-resolve-gmail-wake-input';
import { readCallContext } from './read-call-context';
import type { GmailDeps } from './types';
import { wakeSetArgumentsSchema } from './wake-set-arguments-schema';

const durationPattern = '^[1-9][0-9]{0,6}(ms|s|m|h|d)$';
const addressPattern = String.raw`^(@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$`;

// gmail.wake_set: a wake rule on a connected Gmail account, as a queued call that asks by default.
// Gmail stays at Google, so a rule keeps nothing of a mail that it does not match.
export function buildGmailWakeSetTool(deps: GmailDeps): ToolDefinition {
  return {
    name: gmailToolNames.wakeSet,
    description:
      'Sets a wake rule on a connected Google account: Gmail mail is silent until a rule matches ' +
      'it. The rule wakes the conversation or a task when a mail matches from (addresses, or ' +
      '@domain), subject (a word) or thread (a Gmail thread ID), and stays until expires passes, ' +
      'or until you cancel it when you give no expires. A match wakes its target at once, unless ' +
      'the rule woke it within its window, and then it waits and arrives with the later ones in ' +
      'one wake. wake names the target: conversation or a task ID, and it defaults to you. The ' +
      'call is queued: the rule starts when it is approved and runs, and it never matches a mail ' +
      'that came before, so search for those with gmail.search.',
    input: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'string', pattern: addressPattern }, minItems: 1 },
        subject: { type: 'string', minLength: 1 },
        thread: { type: 'string', description: 'a thread ID from gmail.search or gmail.read' },
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
        connection: { type: 'string' },
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
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: gmailDeclarations.wakeSet,
    execution: 'direct',
    resolveInput: makeResolveGmailWakeInput(deps),
    run: (call) => runWakeSet(deps, call.input),
  };
}

// Writes the rule when the call runs: at once under an allow rule, or once the owner approved it. The
// rule starts now and its expiry counts from now. A target task that ended since the call refuses
// with TASK_ENDED. A rule with the same match and target is replaced in place, so a repeat is safe.
async function runWakeSet(deps: GmailDeps, input: JSONObject): Promise<ToolOutcome> {
  const context = await readCallContext(deps.access, input);

  if (context === null) {
    return { status: 'error', message: 'UNKNOWN_CONNECTION: no live connection has that ID' };
  }

  const parsed = wakeSetArgumentsSchema.safeParse(input);

  if (!parsed.success) {
    return { status: 'error', message: 'BAD_RULE: the arguments of the rule are unreadable' };
  }

  const args = parsed.data;
  const now = deps.clock.now();

  const timing = pickWakeTiming({
    expires: args.expires,
    window: args.window,
    nowMs: now,
    defaultWindowMs: deps.wake.defaultWindowMs,
  });

  if (timing.status === 'bad') {
    return { status: 'error', message: 'BAD_DURATION: the expiry or the window is out of range' };
  }

  const target = await resolveWakeTarget(deps.log, args.setBy, args.wake);

  if (target.status === 'refused') {
    return {
      status: 'ok',
      result: { refused: { code: 'TASK_ENDED', message: target.message } },
      refusalCode: 'TASK_ENDED',
    };
  }

  const match = {
    ...(args.from === undefined ? {} : { from: args.from }),
    ...(args.subject === undefined ? {} : { subject: args.subject }),
    ...(args.thread === undefined ? {} : { thread: args.thread }),
  };

  const rule = await withWriteTransaction(deps.log.writer, (tx) =>
    setWakeRuleInTransaction(tx, deps.wake.context(), {
      mailbox: { kind: 'gmail', connectionID: context.connectionID },
      match,
      target: target.target,
      setBy: args.setBy,
      expiresAt: timing.expiresAt,
      windowMs: timing.windowMs,
      origin: 'tool',
    }),
  );

  return {
    status: 'ok',
    result: {
      rule: rule.shortID,
      expiresAt: timing.expiresAt === null ? null : new Date(timing.expiresAt).toISOString(),
      window: formatDurationText(rule.windowMs),
      replaced: rule.replaced,
    },
  };
}
