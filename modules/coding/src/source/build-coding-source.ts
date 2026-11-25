import { toErrorFields } from '@heynixie/logger';
import type { TriggerContext, TriggerSource } from '@heynixie/triggers';
import { codingSourcePrefix } from '../projection/coding-source-prefix';
import { toBinding } from '../session/read-binding';
import type { Binding, CodingAdapter, CodingContext, CodingTables } from '../types';
import { collectTaskInputs } from './collect-task-inputs';

// The trigger source that reads the adapter's event trail into the thread of each coding task, one
// per adapter. It holds a long read open, and stores its cursor through `deliver`, so a page's
// records and its cursor commit together.
export function buildCodingSource(context: CodingContext, adapter: CodingAdapter): TriggerSource {
  let controller: AbortController | null = null;
  let loop: Promise<void> | null = null;

  return {
    id: `${codingSourcePrefix}${adapter.id}`,
    kind: 'stream',
    start: (trigger) => {
      const running = new AbortController();

      controller = running;

      loop = runCodingStream({
        context,
        adapter,
        trigger,
        signal: AbortSignal.any([running.signal, trigger.signal]),
        cursor: typeof trigger.cursor === 'string' ? trigger.cursor : null,
        caughtUp: new Set(),
      });

      return Promise.resolve();
    },
    stop: async () => {
      controller?.abort();

      await loop;
    },
  };
}

interface StreamRun {
  readonly context: CodingContext;
  readonly adapter: CodingAdapter;
  readonly trigger: TriggerContext;
  readonly signal: AbortSignal;
  cursor: string | null;

  // the tasks whose sessions the source read from their own cursor since it started
  readonly caughtUp: Set<string>;
}

const firstRetryMs = 1000;
const maxRetryMs = 5 * 60 * 1000;
const unhealthyAfter = 3;

async function runCodingStream(run: StreamRun): Promise<void> {
  let failures = 0;

  while (!run.signal.aborted) {
    try {
      await readStreamPages(run);

      failures = 0;
    } catch (error) {
      failures += 1;

      run.context.logEvent('coding.source_failed', {
        adapter: run.adapter.id,
        failures,
        ...toErrorFields(error),
      });

      if (failures >= unhealthyAfter) {
        run.trigger.reportHealth('unhealthy');
      }

      await run.context.tasks.clock
        .sleep(Math.min(maxRetryMs, firstRetryMs * 2 ** (failures - 1)), run.signal)
        .catch(() => {});
    }
  }
}

async function readStreamPages(run: StreamRun): Promise<void> {
  if (run.cursor === null) {
    run.cursor = await readFirstCursor(run);

    await run.trigger.deliver({ cursor: run.cursor, events: [] });
  }

  await runCatchUps(run);

  for await (const page of run.adapter.events(run.cursor, run.signal)) {
    await runCatchUps(run);

    const bindings = await readLiveBindings(run);

    await run.trigger.deliver({
      cursor: page.cursor,
      events: collectTaskInputs(page.events, bindings),
    });

    run.cursor = page.cursor;

    run.trigger.reportHealth('running');
  }
}

// At its first start, the source keeps only the cursor of its first read, so it never replays the
// trail.
async function readFirstCursor(run: StreamRun): Promise<string> {
  for await (const page of run.adapter.events(null, run.signal)) {
    return page.cursor;
  }

  throw new Error('the event trail gave no cursor');
}

// A session's events can reach the trail before its task binds it, so the source reads each newly
// bound session's trail from the cursor its task took, under its own stored cursor. Each event
// keeps its key, so an event that both reads deliver lands once.
async function runCatchUps(run: StreamRun): Promise<void> {
  const bindings = await readLiveBindings(run);

  for (const binding of bindings.values()) {
    if (!run.caughtUp.has(binding.taskID) && binding.state !== 'ended') {
      await runCatchUp(run, binding);

      run.caughtUp.add(binding.taskID);
    }
  }
}

// The sessions that the adapter's open coding tasks bind, by the adapter's session ID.
async function readLiveBindings(run: StreamRun): Promise<ReadonlyMap<string, Binding>> {
  const rows = await run.context.tasks.log.writer.db
    .$extendTables<CodingTables>()
    .selectFrom('coding_sessions')
    .selectAll()
    .where('adapter', '=', run.adapter.id)
    .where('unbound_at', 'is', null)
    .execute();

  return new Map(rows.map((row) => [row.session_id, toBinding(row)]));
}

async function runCatchUp(run: StreamRun, binding: Binding): Promise<void> {
  const only = new Map([[binding.sessionID, binding]]);

  for await (const page of run.adapter.events(binding.fromCursor, run.signal)) {
    if (page.events.length === 0) {
      return;
    }

    await run.trigger.deliver({
      cursor: run.cursor,
      events: collectTaskInputs(page.events, only),
    });
  }
}
