import { toErrorFields } from '@heynixie/logger';
import type { TextArrivalEvent, TriggerContext, TriggerSource } from '@heynixie/triggers';
import { writeReceivedText } from '../store/write-received-text';
import type { PhoneContext, ProviderText } from '../types';
import { buildNextCursor } from './build-next-cursor';
import { buildStartCursor } from './build-start-cursor';
import { collectArrivalTexts } from './collect-arrival-texts';
import type { PhoneCursor } from './phone-cursor';
import { phoneCursorSchema } from './phone-cursor';
import { phoneSourceID } from './phone-source-id';
import { pickNewTexts } from './pick-new-texts';

// The trigger source of the assistant's phone. It reads the provider's message list every poll
// interval, so nixie needs no address that the internet can reach. Each new text is stored first,
// then its arrival is delivered with the new cursor, so a crash between the two delivers it again.
export function buildPhoneSource(context: PhoneContext): TriggerSource {
  let controller: AbortController | null = null;
  let loop: Promise<unknown> | null = null;

  return {
    id: phoneSourceID,
    kind: 'text',
    start: (trigger) => {
      const running = new AbortController();

      controller = running;

      const parsed = phoneCursorSchema.nullable().parse(trigger.cursor);

      loop = runPhoneLoop({
        context,
        trigger,
        signal: AbortSignal.any([running.signal, trigger.signal]),
        cursor: parsed,
      });

      return Promise.resolve();
    },
    stop: async () => {
      controller?.abort();

      await loop;
    },
  };
}

const unhealthyAfter = 3;
const firstRetryMs = 60_000;
const maxRetryMs = 60 * 60_000;

interface PhoneRun {
  readonly context: PhoneContext;
  readonly trigger: TriggerContext;
  readonly signal: AbortSignal;
  cursor: PhoneCursor | null;
}

async function runPhoneLoop(run: PhoneRun): Promise<void> {
  let failures = 0;

  while (!run.signal.aborted) {
    let delayMs = run.context.settings.pollIntervalMs;

    try {
      await readProviderOnce(run);

      failures = 0;

      run.trigger.reportHealth('running');
    } catch (error) {
      failures += 1;
      delayMs = Math.min(maxRetryMs, firstRetryMs * 2 ** (failures - 1));

      run.context.logEvent('phone.source_failed', {
        failures,
        retryInMs: delayMs,
        ...toErrorFields(error),
      });
    }

    if (failures >= unhealthyAfter) {
      run.trigger.reportHealth('unhealthy');
    }

    await run.context.clock.sleep(delayMs, run.signal).catch(() => {});
  }
}

// At its first start the source records where the provider stands and writes nothing for the texts
// it holds. Every later read stores each text past the cursor, and delivers an arrival for each one
// received in the last hour, so an outage's texts are stored whatever their age.
async function readProviderOnce(run: PhoneRun): Promise<void> {
  const provider = run.context.provider;

  if (run.cursor === null) {
    const recent = await provider.readRecent();

    const cursor = buildStartCursor(recent);

    await run.trigger.deliver({ cursor, events: [] });

    run.cursor = cursor;

    return;
  }

  const inbound = await provider.readInbound(run.cursor.since);

  const fresh = pickNewTexts(inbound, run.cursor);

  if (fresh.length === 0) {
    return;
  }

  const shortIDs = new Map<string, string>();

  for (const text of fresh) {
    const shortID = await writeReceivedText(run.context, text);

    shortIDs.set(text.messageID, shortID);
  }

  const now = run.context.clock.now();

  const events = collectArrivalTexts(fresh, now).map((text) =>
    buildArrivalEvent(text, shortIDs.get(text.messageID) ?? '', now),
  );

  const cursor = buildNextCursor(run.cursor, fresh);

  await run.trigger.deliver({ cursor, events });

  run.cursor = cursor;
}

function buildArrivalEvent(text: ProviderText, shortID: string, nowMs: number): TextArrivalEvent {
  return {
    kind: 'text',
    mailbox: { kind: 'source', sourceID: phoneSourceID },
    dedupeKey: text.messageID,
    occurredAt: new Date(nowMs).toISOString(),
    payload: {
      messageID: shortID,
      from: text.from,
      receivedAt: text.receivedAt,
      precisionMs: text.precisionMs,
      body: text.body,
    },
  };
}
