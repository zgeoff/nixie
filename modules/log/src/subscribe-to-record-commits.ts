import { assign, createActor, fromPromise, setup, stateIn } from 'xstate';
import { subscribeToCommits } from './subscribe-to-commits';
import type { LogTables, Writer } from './types';

interface RecordCommitInput {
  readonly readHead: () => Promise<number>;
  readonly onRecords: () => void;
}

interface RecordCommitContext {
  readonly input: RecordCommitInput;

  readonly last: number | null;
}

type RecordCommitEvent = { readonly type: 'commit' } | { readonly type: 'stop' };

const recordCommitActors = {
  readHead: fromPromise<number, RecordCommitInput>((read) => read.input.readHead()),
};

const isStale = stateIn({ reading: 'stale' });

// xstate's `setup` takes its type parameters in this order: context, events, actors, children,
// actions, guards, delays, tags, then input.
const recordCommitMachine = setup<
  RecordCommitContext,
  RecordCommitEvent,
  typeof recordCommitActors,
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  never,
  string,
  RecordCommitInput
>({ actors: recordCommitActors }).createMachine({
  id: 'recordCommits',
  context: (start) => ({ input: start.input, last: null }),
  initial: 'reading',
  on: { stop: { target: '.stopped' } },
  states: {
    idle: {
      on: { commit: { target: 'reading' } },
    },
    reading: {
      initial: 'fresh',
      states: {
        fresh: { on: { commit: { target: 'stale' } } },
        stale: {},
      },
      invoke: {
        // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate names the invoked actor `src`
        src: 'readHead',
        input: (entered) => entered.context.input,
        onDone: [
          {
            guard: isStale,
            target: 'reading',
            reenter: true,
            actions: [
              (read) => {
                // A commit that lands during the first read can already sit in its head.
                if (read.context.last === null || read.event.output > read.context.last) {
                  read.context.input.onRecords();
                }
              },
              assign({ last: (read) => read.event.output }),
            ],
          },
          {
            target: 'idle',
            actions: [
              (read) => {
                if (read.context.last !== null && read.event.output > read.context.last) {
                  read.context.input.onRecords();
                }
              },
              assign({ last: (read) => read.event.output }),
            ],
          },
        ],

        // A read after the writer stopped fails, and the subscriber's own poll stays its fallback.
        onError: [{ guard: isStale, target: 'reading', reenter: true }, { target: 'idle' }],
      },
    },
    stopped: { type: 'final' },
  },
});

// A commit that wrote no record, such as a claim that found no work, calls back nothing, so a
// subscriber that writes such commits never wakes itself in a loop.
export function subscribeToRecordCommits(
  writer: Pick<Writer, 'commits' | 'db'>,
  onRecords: () => void,
): () => void {
  const actor = createActor(recordCommitMachine, {
    input: { readHead: () => readHeadSequence(writer), onRecords },
  });

  actor.start();

  const unsubscribe = subscribeToCommits(writer, () => {
    actor.send({ type: 'commit' });
  });

  return () => {
    unsubscribe();

    actor.send({ type: 'stop' });
  };
}

async function readHeadSequence(writer: Pick<Writer, 'db'>): Promise<number> {
  const head = await writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('sequence'))
    .executeTakeFirst();

  return head?.sequence ?? 0;
}
