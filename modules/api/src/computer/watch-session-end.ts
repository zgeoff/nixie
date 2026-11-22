import { subscribeToRecords } from '@heynixie/log';
import { probeLiveSession } from '../session/probe-live-session';
import type { APIContext } from '../types';
import { readHeadSequence } from '../utils/read-head-sequence';
import { sessionRevokedCodec } from '../utils/session-revoked-codec';

// Calls onEnd, once, when the session is revoked or lapses past the idle limit. It listens for the
// revocation record, and checks the session on an interval no longer than the idle limit or the last
// seen interval. It returns the function that stops the watching.
export async function watchSessionEnd(
  context: APIContext,
  identityID: string,
  onEnd: () => void,
): Promise<() => void> {
  const stopped = new AbortController();

  const end = (): void => {
    if (!stopped.signal.aborted) {
      stopped.abort();

      onEnd();
    }
  };

  const head = await readHeadSequence(context);

  void followRevocation(context, { identityID, afterSequence: head, signal: stopped.signal }, end);
  void recheckSession(context, { identityID, signal: stopped.signal }, end);

  return () => {
    stopped.abort();
  };
}

interface SessionWatch {
  readonly identityID: string;
  readonly signal: AbortSignal;
}

async function followRevocation(
  context: APIContext,
  watch: SessionWatch & { readonly afterSequence: number },
  end: () => void,
): Promise<void> {
  try {
    for await (const entry of subscribeToRecords(context.log, {
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
    // a failed subscription leaves the interval check to end the watch
  }
}

async function recheckSession(
  context: APIContext,
  watch: SessionWatch,
  end: () => void,
): Promise<void> {
  const intervalMs = Math.min(context.settings.sessionIdleMs, context.settings.lastSeenIntervalMs);

  try {
    while (!watch.signal.aborted) {
      if (!(await probeLiveSession(context, watch.identityID))) {
        end();

        return;
      }

      await context.clock.sleep(intervalMs, watch.signal);
    }
  } catch {
    // a failed read ends the watch, because a session nobody can check is not trusted
    end();
  }
}
