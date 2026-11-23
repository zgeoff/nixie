import { subscribeToRecords } from '@heynixie/log';
import { probeLiveSession } from '../session/probe-live-session';
import type { APIContext } from '../types';
import { readHeadSequence } from '../utils/read-head-sequence';
import { sessionRevokedCodec } from '../utils/session-revoked-codec';

export interface SessionEndHooks {
  // runs once when the session is revoked or lapses past the idle limit
  readonly onEnd: () => void;

  // Runs when the interval check finds the session revoked after the revocation subscription failed,
  // so a revocation that nobody heard of still ends what the session held.
  readonly onRevokedUnheard: () => void;
}

// Calls onEnd, once, when the session is revoked or lapses past the idle limit. It listens for the
// revocation record, and checks the session on an interval no longer than the idle limit or the last
// seen interval. It returns the function that stops the watching.
export async function watchSessionEnd(
  context: APIContext,
  identityID: string,
  hooks: SessionEndHooks,
  subscribe: typeof subscribeToRecords = subscribeToRecords,
): Promise<() => void> {
  const stopped = new AbortController();

  const subscription = { hasFailed: false };
  const onEnd = hooks.onEnd;

  const end = (): void => {
    if (!stopped.signal.aborted) {
      stopped.abort();

      onEnd();
    }
  };

  const head = await readHeadSequence(context);

  const watch = { identityID, signal: stopped.signal };

  void followRevocation(context, { ...watch, afterSequence: head, subscribe, subscription }, end);

  void recheckSession(context, watch, {
    end,
    subscription,
    onRevokedUnheard: hooks.onRevokedUnheard,
  });

  return () => {
    stopped.abort();
  };
}

interface SessionWatch {
  readonly identityID: string;
  readonly signal: AbortSignal;
}

interface RevocationWatch extends SessionWatch {
  readonly afterSequence: number;
  readonly subscribe: typeof subscribeToRecords;
  readonly subscription: { hasFailed: boolean };
}

async function followRevocation(
  context: APIContext,
  watch: RevocationWatch,
  end: () => void,
): Promise<void> {
  try {
    for await (const entry of watch.subscribe(context.log, {
      afterSequence: watch.afterSequence,
      signal: watch.signal,
    })) {
      const record = entry.record;

      if (
        record.kind === sessionRevokedCodec.kind &&
        sessionRevokedCodec.decode(record.payload).identityID === watch.identityID
      ) {
        end();

        return;
      }
    }
  } catch {
    // a failed subscription leaves the interval check to end the watch and what the session held
    watch.subscription.hasFailed = true;
  }
}

interface Recheck {
  readonly end: () => void;
  readonly subscription: { readonly hasFailed: boolean };
  readonly onRevokedUnheard: () => void;
}

async function recheckSession(
  context: APIContext,
  watch: SessionWatch,
  recheck: Recheck,
): Promise<void> {
  const intervalMs = Math.min(context.settings.sessionIdleMs, context.settings.lastSeenIntervalMs);

  try {
    while (!watch.signal.aborted) {
      if (!(await probeLiveSession(context, watch.identityID))) {
        if (recheck.subscription.hasFailed) {
          recheck.onRevokedUnheard();
        }

        recheck.end();

        return;
      }

      await context.clock.sleep(intervalMs, watch.signal);
    }
  } catch {
    // a failed read ends the watch, because a session nobody can check is not trusted
    recheck.end();
  }
}
