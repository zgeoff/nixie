import { toErrorFields } from '@heynixie/logger';
import type { MailArrivalEvent, TriggerContext, TriggerSource } from '@heynixie/triggers';
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

const firstRetryMs = 60_000;
const maxRetryMs = 60 * 60_000;
const unhealthyAfter = 3;

async function runMailLoop(run: MailRun): Promise<void> {
  let failures = 0;

  while (!run.signal.aborted) {
    let delayMs = run.context.settings.hostPollIntervalMs;

    try {
      const retryAfterMs = await readHostOnce(run);

      if (retryAfterMs === null) {
        failures = 0;

        run.trigger.reportHealth('running');
      } else {
        failures += 1;
        delayMs = retryAfterMs;
      }
    } catch (error) {
      failures += 1;
      delayMs = Math.min(maxRetryMs, firstRetryMs * 2 ** (failures - 1));

      run.context.logEvent('mail.source_failed', { failures, ...toErrorFields(error) });
    }

    if (failures >= unhealthyAfter) {
      run.trigger.reportHealth('unhealthy');
    }

    await sleepUntilHint(run, delayMs);
  }
}

// Reads the host once. Returns null after a read that stored and delivered, or the time to wait
// after a failed read.
async function readHostOnce(run: MailRun): Promise<number | null> {
  if (run.cursor === null) {
    run.cursor = await run.host.begin();

    await run.trigger.deliver({ cursor: run.cursor, events: [] });
  }

  const changes = await run.host.readChanges(run.cursor);

  if (changes.kind === 'failed') {
    run.context.logEvent('mail.host_read_failed', { reason: changes.reason });

    return changes.after ?? firstRetryMs;
  }

  const events: MailArrivalEvent[] = [];

  for (const mail of changes.mails) {
    const event = await writeArrival(run.context, mail);

    events.push(event);
  }

  await run.trigger.deliver({ cursor: changes.cursor, events });

  run.cursor = changes.cursor;

  return null;
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

async function sleepUntilHint(run: MailRun, delayMs: number): Promise<void> {
  if (run.signal.aborted) {
    return;
  }

  const waking = new AbortController();

  run.wake = () => {
    waking.abort();
  };

  await run.context.clock
    .sleep(delayMs, AbortSignal.any([run.signal, waking.signal]))
    .catch(() => {});
}

// A host that pushes a hint ends the wait for the next read at once.
async function runHintLoop(run: MailRun): Promise<void> {
  if (run.host.watch === undefined) {
    return;
  }

  try {
    for await (const hint of run.host.watch(run.signal)) {
      void hint;
      run.wake();
    }
  } catch (error) {
    if (!run.signal.aborted) {
      run.context.logEvent('mail.watch_failed', toErrorFields(error));
    }
  }
}
