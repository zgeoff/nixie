import type { JSONObject } from '@heynixie/log';
import type { ToolOutcome } from '@heynixie/tools';
import { formatDurationText, pickWakeTiming, resolveWakeTarget } from '@heynixie/triggers';
import { readCallContext } from './read-call-context';
import type { GmailDeps } from './types';
import { wakeSetArgumentsSchema } from './wake-set-arguments-schema';
import { writeGmailWakeRule } from './write-gmail-wake-rule';

// Writes the rule when the call runs: at once under an allow rule, or once the owner approved it. The
// rule starts now and its expiry counts from now. A target task that ended since the call refuses
// with TASK_ENDED. A rule with the same match and target is replaced in place, so a repeat is safe.
export async function runGmailWakeSet(deps: GmailDeps, input: JSONObject): Promise<ToolOutcome> {
  const parsed = wakeSetArgumentsSchema.safeParse(input);

  if (!parsed.success) {
    return { status: 'error', message: 'BAD_RULE: the arguments of the rule are unreadable' };
  }

  const args = parsed.data;

  const context = await readCallContext(deps.access, input);

  if (context === null) {
    return { status: 'error', message: 'UNKNOWN_CONNECTION: no live connection has that ID' };
  }

  const timing = pickWakeTiming({
    expires: args.expires,
    window: args.window,
    nowMs: deps.clock.now(),
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

  const rule = await writeGmailWakeRule(deps, {
    connectionID: context.connectionID,
    match: {
      ...(args.from === undefined ? {} : { from: args.from }),
      ...(args.subject === undefined ? {} : { subject: args.subject }),
      ...(args.thread === undefined ? {} : { thread: args.thread }),
    },
    target: target.target,
    setBy: args.setBy,
    expiresAt: timing.expiresAt,
    windowMs: timing.windowMs,
    origin: 'tool',
  });

  if (rule === null) {
    return { status: 'error', message: 'UNKNOWN_CONNECTION: no live connection has that ID' };
  }

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
