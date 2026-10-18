import type { Clock } from '@heynixie/clock';
import { assign, fromPromise, setup } from 'xstate';
import { checkParts } from './check-parts';
import type { HealthReport, PartCheck, PartReport } from './types';

export interface PartRefreshOptions<Part extends string> {
  // the checks too slow to run on each health request, such as a call to another service
  readonly checks: Readonly<Record<Part, PartCheck>>;
  readonly clock: Clock;

  // the wait between the end of one round of checks and the start of the next. A part that fails
  // shows up to this wait plus two timeouts later: the round in flight ends, then the next one runs.
  readonly intervalMs: number;

  // the longest one part's check runs before the part reports unready
  readonly timeoutMs: number;
}

interface PartRefreshContext {
  readonly options: PartRefreshOptions<string>;

  // each part's last report, with no entry until the part's first check ends. A map, so a part
  // named for an Object property, such as constructor, never reads that property as its report.
  readonly reports: ReadonlyMap<string, PartReport>;

  // the parts whose check still runs, a check from an earlier round that outlasted its timeout
  // included
  readonly running: ReadonlySet<string>;

  // the parts the round in flight checks: every part but those whose check still runs
  readonly round: readonly string[];

  // a stop came while a round ran, so the refresh stops once that round ends
  readonly isStopping: boolean;
}

// part.settled: a part's check resolved or rejected, after its timeout too
type PartRefreshEvent =
  | { readonly type: 'stop' }
  | { readonly type: 'part.settled'; readonly part: string };

interface RoundInput {
  readonly options: PartRefreshOptions<string>;
  readonly parts: readonly string[];
  readonly onSettled: (part: string) => void;
}

// The part refresh: a round of checks at once, then one each interval. A check past its timeout sees
// its signal abort and runs again next round, unless it ignores the signal and still runs. A stop
// ends a wait at once, and ends a round only after it.
export const partRefreshMachine = setup({
  types: {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    input: {} as PartRefreshOptions<string>,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    context: {} as PartRefreshContext,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- xstate reads these types only at compile time
    events: {} as PartRefreshEvent,
  },
  actors: {
    wait: fromPromise<void, PartRefreshOptions<string>>((wait) =>
      wait.input.clock.sleep(wait.input.intervalMs, wait.signal),
    ),
    check: fromPromise<HealthReport, RoundInput>((round) => runRound(round.input)),
  },
}).createMachine({
  id: 'partRefresh',
  context: (start) => ({
    options: start.input,
    reports: new Map(),
    running: new Set(),
    round: [],
    isStopping: false,
  }),
  initial: 'checking',
  on: {
    'part.settled': {
      actions: assign((settled) => ({
        running: new Set(
          [...settled.context.running].filter((part) => part !== settled.event.part),
        ),
      })),
    },
  },
  states: {
    checking: {
      entry: assign((entered) => {
        const round = Object.keys(entered.context.options.checks).filter(
          (part) => !entered.context.running.has(part),
        );

        return { round, running: new Set([...entered.context.running, ...round]) };
      }),
      invoke: {
        src: 'check',
        input: (entered) => ({
          options: entered.context.options,
          parts: entered.context.round,
          onSettled: (part) => {
            // a check that settles after the refresh stopped has nothing left to tell it
            if (entered.self.getSnapshot().status === 'active') {
              entered.self.send({ type: 'part.settled', part });
            }
          },
        }),
        onDone: [
          {
            guard: (checked) => checked.context.isStopping,
            target: 'stopped',
            actions: assign((checked) => ({
              reports: new Map([
                ...checked.context.reports,
                ...Object.entries(checked.event.output.parts),
              ]),
            })),
          },
          {
            target: 'waiting',
            actions: assign((checked) => ({
              reports: new Map([
                ...checked.context.reports,
                ...Object.entries(checked.event.output.parts),
              ]),
            })),
          },
        ],
      },
      on: { stop: { actions: assign({ isStopping: true }) } },
    },
    waiting: {
      invoke: {
        src: 'wait',
        input: (entered) => entered.context.options,
        onDone: { target: 'checking' },
      },
      on: { stop: { target: 'stopped' } },
    },
    stopped: { type: 'final' },
  },
});

// runs one round's checks, each of which reports when it settles, after its timeout too
function runRound(round: RoundInput): Promise<HealthReport> {
  const checks = Object.fromEntries(
    Object.entries<PartCheck>(round.options.checks)
      .filter(([part]) => round.parts.includes(part))
      .map(([part, check]) => [
        part,
        makeTrackedCheck(check, () => {
          round.onSettled(part);
        }),
      ]),
  );

  return checkParts(checks, round.options.timeoutMs, round.options.clock);
}

function makeTrackedCheck(check: PartCheck, onSettled: () => void): PartCheck {
  return async (signal) => {
    try {
      return await check(signal);
    } finally {
      onSettled();
    }
  };
}
