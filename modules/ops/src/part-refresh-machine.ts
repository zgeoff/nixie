import type { Clock } from '@heynixie/clock';
import { machineTypes } from '@zgeoff/std';
import { assign, fromPromise, setup } from 'xstate';
import { checkParts } from './check-parts';
import type { HealthReport, PartCheck, PartReport } from './types';

export interface PartRefreshOptions<Part extends string> {
  readonly checks: Readonly<Record<Part, PartCheck>>;
  readonly clock: Clock;

  readonly intervalMs: number;

  readonly timeoutMs: number;
}

interface PartRefreshContext {
  readonly options: PartRefreshOptions<string>;

  // A plain object would hand a part named for an Object property, such as constructor, that
  // property as its report.
  readonly reports: ReadonlyMap<string, PartReport>;

  readonly running: ReadonlySet<string>;

  readonly round: readonly string[];

  readonly isStopping: boolean;
}

type PartRefreshEvent =
  | { readonly type: 'stop' }
  | { readonly type: 'part.settled'; readonly part: string };

interface RoundInput {
  readonly options: PartRefreshOptions<string>;
  readonly parts: readonly string[];
  readonly onSettled: (part: string) => void;
}

export const partRefreshMachine = setup({
  types: machineTypes<{
    input: PartRefreshOptions<string>;
    context: PartRefreshContext;
    events: PartRefreshEvent;
  }>(),
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
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'check',
        input: (entered) => ({
          options: entered.context.options,
          parts: entered.context.round,
          onSettled: (part) => {
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
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'wait',
        input: (entered) => entered.context.options,
        onDone: { target: 'checking' },
      },
      on: { stop: { target: 'stopped' } },
    },
    stopped: { type: 'final' },
  },
});

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
