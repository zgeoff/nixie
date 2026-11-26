import { toErrorFields } from '@heynixie/logger';
import type { MailArrivalEvent, TriggerContext, TriggerSource } from '@heynixie/triggers';
import { withHostLock } from '../host/with-host-lock';
import { parseMail } from '../parse/parse-mail';
import { writeReceivedMail } from '../store/write-received-mail';
import type { HostCursor, HostMail, MailContext, MailHost } from '../types';

interface MailRun {
  readonly context: MailContext;
  readonly host: MailHost;
  readonly trigger: TriggerContext;
  readonly signal: AbortSignal;
  cursor: HostCursor;

  // ends the sleep between 2 reads, for a hint from the host
  wake: () => void;

  // a hint came after the latest read began, so the mail it tells of may be past what that read saw
  isHinted: boolean;
}

// The trigger source of the assistant's own mailbox. It reads the host every poll interval, and at
// once on a hint. Each new mail is stored in a write transaction of its own, then its arrival is
// delivered with the host's cursor, so a crash between the two delivers the arrival again.
export function buildMailSource(context: MailContext, host: MailHost): TriggerSource {
  let controller: AbortController | null = null;
  let loops: Promise<unknown> | null = null;

  return {
    id: 'mail',
    kind: 'mail',
    start: (trigger) => {
      const running = new AbortController();

      controller = running;

      const run: MailRun = {
        context,
        host,
        trigger,
        signal: AbortSignal.any([running.signal, trigger.signal]),
        cursor: trigger.cursor,
        wake: () => {},
        isHinted: false,
      };

      loops = Promise.all([runMailLoop(run), runHintLoop(run)]);

      return Promise.resolve();
    },
    stop: async () => {
      controller?.abort();

      await loops;
    },
  };
}

const unhealthyAfter = 3;

async function runMailLoop(run: MailRun): Promise<void> {
  let failures = 0;

  while (!run.signal.aborted) {
    let delayMs = run.context.settings.hostPollIntervalMs;
    let isHintable = true;

    run.isHinted = false;

    try {
      const read = await withHostLock(run.host, () => readHostOnce(run));

      if (read.kind === 'read') {
        failures = 0;

        run.trigger.reportHealth('running');
      } else {
        failures += 1;
        isHintable = false;
        delayMs = read.afterMs ?? buildBackoffMs(failures);

        run.context.logEvent('mail.host_read_failed', {
          reason: read.reason,
          failures,
          retryInMs: delayMs,
        });
      }
    } catch (error) {
      failures += 1;
      isHintable = false;
      delayMs = buildBackoffMs(failures);

      run.context.logEvent('mail.source_failed', { failures, ...toErrorFields(error) });
    }

    if (failures >= unhealthyAfter) {
      run.trigger.reportHealth('unhealthy');
    }

    await sleepUntilHint(run, delayMs, isHintable);
  }
}

type HostRead =
  | { readonly kind: 'read' }

  // afterMs: the host's own retry time, when it names one
  | { readonly kind: 'failed'; readonly reason: string; readonly afterMs: number | undefined };

// Reads the host once, and stores and delivers what it holds, or reports the failure that the host
// answered.
async function readHostOnce(run: MailRun): Promise<HostRead> {
  if (run.cursor === null) {
    run.cursor = await run.host.begin();

    await run.trigger.deliver({ cursor: run.cursor, events: [] });
  }

  const changes = await run.host.readChanges(run.cursor);

  if (changes.kind === 'failed') {
    return { kind: 'failed', reason: changes.reason, afterMs: changes.after };
  }

  const events: MailArrivalEvent[] = [];

  for (const mail of changes.mails) {
    const event = await writeArrival(run.context, mail);

    events.push(event);
  }

  await run.trigger.deliver({ cursor: changes.cursor, events });

  run.cursor = changes.cursor;

  return { kind: 'read' };
}

async function writeArrival(context: MailContext, mail: HostMail): Promise<MailArrivalEvent> {
  const parsed = parseMail(mail.raw);

  const stored = await writeReceivedMail(context, mail, parsed);

  return {
    kind: 'mail',
    mailbox: { kind: 'mail' },
    dedupeKey: mail.hostMessageID,
    occurredAt: new Date(context.clock.now()).toISOString(),
    payload: {
      messageID: stored.shortID,
      threadID: stored.threadShortID,
      receivedAt: mail.receivedAt,
      from: parsed.from,
      subject: parsed.subject,
    },
  };
}

const firstRetryMs = 60_000;
const maxRetryMs = 60 * 60_000;

// The wait after a run of failures: a minute after the first, doubling after each, up to an hour.
function buildBackoffMs(failures: number): number {
  return Math.min(maxRetryMs, firstRetryMs * 2 ** (failures - 1));
}

// After a failed read the wait is the backoff or the host's own retry time, which a hint never ends.
// A hint that came during a read that worked skips the wait.
async function sleepUntilHint(run: MailRun, delayMs: number, isHintable: boolean): Promise<void> {
  if (run.signal.aborted || (isHintable && run.isHinted)) {
    return;
  }

  const waking = new AbortController();

  run.wake = () => {
    if (isHintable) {
      waking.abort();
    }
  };

  await run.context.clock
    .sleep(delayMs, AbortSignal.any([run.signal, waking.signal]))
    .catch(() => {});
}

// A host that pushes a hint ends the wait for the next read at once, after a read that worked.
async function runHintLoop(run: MailRun): Promise<void> {
  if (run.host.watch === undefined) {
    return;
  }

  try {
    const hints = run.host.watch(run.signal)[Symbol.asyncIterator]();

    for (let next = await hints.next(); next.done !== true; next = await hints.next()) {
      run.isHinted = true;

      run.wake();
    }
  } catch (error) {
    if (!run.signal.aborted) {
      run.context.logEvent('mail.watch_failed', toErrorFields(error));
    }
  }
}
