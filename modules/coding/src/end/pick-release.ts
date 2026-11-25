import type { Definitions, RecordInput } from '@heynixie/log';
import type { RunnerAction, RunnerEndCause } from '@heynixie/tasks';
import { codingToolNames } from '../connector/coding-tool-names';
import { codingSessionUnboundCodec } from '../record/coding-session-unbound-codec';
import type { Binding } from '../types';

export type Release =
  | { readonly kind: 'none' }

  // writes the records and queues the actions in one commit
  | {
      readonly kind: 'commit';
      readonly records: readonly RecordInput[];
      readonly actions: readonly RunnerAction[];
    }

  // stops the session first, and writes the records once the stop answers that it ended
  | { readonly kind: 'stop_first'; readonly records: readonly RecordInput[] };

export interface ReleaseFacts {
  readonly binding: Binding | null;
  readonly cause: RunnerEndCause;
  readonly definitions: Definitions;

  // the record that ended the task, which causes the stop's action
  readonly causeSequence: number;
}

// What the end of a coding task does with its session. A stop stops the session through a
// coding.stop action, which the user's rules decide. A close or a failure stops a started session
// and lets go of a joined one, which runs on as the user's.
export function pickRelease(facts: ReleaseFacts): Release {
  const binding = facts.binding;

  if (binding === null || binding.unboundAt !== null) {
    return { kind: 'none' };
  }

  const records: RecordInput[] = [
    {
      kind: codingSessionUnboundCodec.kind,
      definitions: facts.definitions,
      thread: binding.taskID,
      payload: codingSessionUnboundCodec.encode({
        taskID: binding.taskID,
        adapter: binding.adapter,
        sessionID: binding.sessionID,
        cause: facts.cause,
      }),
    },
  ];

  if (facts.cause === 'stopped') {
    return {
      kind: 'commit',
      records,
      actions: [
        {
          tool: codingToolNames.stop,
          args: { session: `${binding.adapter}:${binding.sessionID}`, origin: binding.origin },
          hashParts: ['stop'],
          causedBy: { kind: 'record', sequence: facts.causeSequence },
        },
      ],
    };
  }

  return binding.origin === 'joined'
    ? { kind: 'commit', records, actions: [] }
    : { kind: 'stop_first', records };
}
