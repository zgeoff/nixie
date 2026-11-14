import type { EnvelopeRecord, JSONObject, RecordKind } from '@heynixie/log';
import { taskPauseRequestedCodec } from '../../pause/task-pause-requested-codec';
import { taskStepStartedCodec } from '../../step/task-step-started-codec';
import { taskLeaseExpiredCodec } from '../../utils/task-lease-expired-codec';
import { taskRevivedCodec } from '../../utils/task-revived-codec';
import { taskStepCommittedCodec } from '../../utils/task-step-committed-codec';
import { taskStepErroredCodec } from '../../utils/task-step-errored-codec';
import { taskStepInterruptedCodec } from '../../utils/task-step-interrupted-codec';
import { taskClosedCodec } from '../codec/task-closed-codec';
import { taskCreatedCodec } from '../codec/task-created-codec';
import { taskInterruptedCodec } from '../codec/task-interrupted-codec';
import { taskPausedCodec } from '../codec/task-paused-codec';
import { taskRestartedCodec } from '../codec/task-restarted-codec';
import { taskResumedCodec } from '../codec/task-resumed-codec';
import { taskStoppedCodec } from '../codec/task-stopped-codec';
import { timerFiredCodec } from '../codec/timer-fired-codec';

type DecodedRecord<
  Codec extends { readonly kind: RecordKind; readonly decode: (payload: JSONObject) => JSONObject },
> = {
  readonly kind: Codec['kind'];
} & ReturnType<Codec['decode']>;

export type TaskRecord =
  | DecodedRecord<typeof taskCreatedCodec>
  | DecodedRecord<typeof taskStepStartedCodec>
  | DecodedRecord<typeof taskStepCommittedCodec>
  | DecodedRecord<typeof taskStepInterruptedCodec>
  | DecodedRecord<typeof taskStepErroredCodec>
  | DecodedRecord<typeof taskLeaseExpiredCodec>
  | DecodedRecord<typeof taskRevivedCodec>
  | DecodedRecord<typeof taskPauseRequestedCodec>
  | DecodedRecord<typeof taskPausedCodec>
  | DecodedRecord<typeof taskResumedCodec>
  | DecodedRecord<typeof taskStoppedCodec>
  | DecodedRecord<typeof taskRestartedCodec>
  | DecodedRecord<typeof taskClosedCodec>
  | DecodedRecord<typeof taskInterruptedCodec>
  | DecodedRecord<typeof timerFiredCodec>;

const taskRecordDecoders: {
  readonly [Kind in TaskRecord['kind']]: (
    payload: JSONObject,
  ) => Extract<TaskRecord, { readonly kind: Kind }>;
} = {
  'task.created': (payload) => ({ kind: 'task.created', ...taskCreatedCodec.decode(payload) }),
  'task.step_started': (payload) => ({
    kind: 'task.step_started',
    ...taskStepStartedCodec.decode(payload),
  }),
  'task.step_committed': (payload) => ({
    kind: 'task.step_committed',
    ...taskStepCommittedCodec.decode(payload),
  }),
  'task.step_interrupted': (payload) => ({
    kind: 'task.step_interrupted',
    ...taskStepInterruptedCodec.decode(payload),
  }),
  'task.step_errored': (payload) => ({
    kind: 'task.step_errored',
    ...taskStepErroredCodec.decode(payload),
  }),
  'task.lease_expired': (payload) => ({
    kind: 'task.lease_expired',
    ...taskLeaseExpiredCodec.decode(payload),
  }),
  'task.revived': (payload) => ({ kind: 'task.revived', ...taskRevivedCodec.decode(payload) }),
  'task.pause_requested': (payload) => ({
    kind: 'task.pause_requested',
    ...taskPauseRequestedCodec.decode(payload),
  }),
  'task.paused': (payload) => ({ kind: 'task.paused', ...taskPausedCodec.decode(payload) }),
  'task.resumed': (payload) => ({ kind: 'task.resumed', ...taskResumedCodec.decode(payload) }),
  'task.stopped': (payload) => ({ kind: 'task.stopped', ...taskStoppedCodec.decode(payload) }),
  'task.restarted': (payload) => ({
    kind: 'task.restarted',
    ...taskRestartedCodec.decode(payload),
  }),
  'task.closed': (payload) => ({ kind: 'task.closed', ...taskClosedCodec.decode(payload) }),
  'task.interrupted': (payload) => ({
    kind: 'task.interrupted',
    ...taskInterruptedCodec.decode(payload),
  }),
  'timer.fired': (payload) => ({ kind: 'timer.fired', ...timerFiredCodec.decode(payload) }),
};

export function parseTaskRecord(record: EnvelopeRecord): TaskRecord | null {
  const kind = record.kind;

  if (!isTaskRecordKind(kind)) {
    return null;
  }

  try {
    return taskRecordDecoders[kind](record.payload);
  } catch (error) {
    throw new Error(`record ${record.sequence} of kind ${kind} does not fit its payload`, {
      cause: error,
    });
  }
}

function isTaskRecordKind(kind: RecordKind): kind is TaskRecord['kind'] {
  return Object.hasOwn(taskRecordDecoders, kind);
}
