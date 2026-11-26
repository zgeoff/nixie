import { formatDurationText, pickWakeTiming, resolveWakeTarget } from '@heynixie/triggers';
import type { ActionAttempt, ProviderResponse } from '../../types';
import { readCallContext } from './read-call-context';
import type { GmailDeps } from './types';
import { wakeSetArgumentsSchema } from './wake-set-arguments-schema';
import { writeGmailWakeRule } from './write-gmail-wake-rule';

// The attempt of gmail.wake_set, once the owner approved it or an allow rule covered it. The rule
// starts now and its expiry counts from now. A target task that ended since the call refuses with
// TASK_ENDED. A rule with the same match and target is replaced in place, so a retry is safe.
export async function runGmailWakeSet(
  deps: GmailDeps,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const parsed = wakeSetArgumentsSchema.safeParse(attempt.arguments);

  if (!parsed.success) {
    return { kind: 'refused', reason: 'BAD_RULE: the arguments of the rule are unreadable' };
  }

  const args = parsed.data;

  const context = await readCallContext(deps.access, attempt.arguments);

  if (context === null) {
    return { kind: 'refused', reason: 'connection_forgotten' };
  }

  const timing = pickWakeTiming({
    expires: args.expires,
    window: args.window,
    nowMs: deps.clock.now(),
    defaultWindowMs: deps.wake.defaultWindowMs,
  });

  if (timing.status === 'bad') {
    return {
      kind: 'refused',
      reason: 'BAD_DURATION: the expiry or the window is out of range',
    };
  }

  const target = await resolveWakeTarget(deps.log, args.setBy, args.wake);

  if (target.status === 'refused') {
    return { kind: 'refused', reason: `TASK_ENDED: ${target.message}` };
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
    return { kind: 'refused', reason: 'connection_forgotten' };
  }

  return {
    kind: 'success',
    result: {
      rule: rule.shortID,
      expiresAt: timing.expiresAt === null ? null : new Date(timing.expiresAt).toISOString(),
      window: formatDurationText(rule.windowMs),
      replaced: rule.replaced,
    },
  };
}
