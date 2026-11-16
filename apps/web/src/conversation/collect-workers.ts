import type { ToolActivity } from './build-activity';
import type { LiveRecord } from './use-live-records';
import type { WorkerActivity, WorkerEndActivity, WorkerTurnActivity } from './worker-activity';

const workerRunToolName = 'worker.run';

// A worker record joins the worker.run call whose ID it carries, so a record whose call is not in
// the step makes no worker run.
export function collectWorkers(
  records: readonly LiveRecord[],
  calls: readonly ToolActivity[],
): readonly WorkerActivity[] {
  const runs = Map.groupBy(
    records.filter((record) => record.worker !== undefined),
    (record) => record.worker?.workerRunID,
  );

  return [...runs].flatMap(([workerRunID, runRecords]) => {
    const callID = runRecords.find((record) => record.worker !== undefined)?.worker?.callID;
    const call = calls.find((candidate) => candidate.callID === callID);

    if (workerRunID === undefined || call?.tool !== workerRunToolName) {
      return [];
    }

    return [
      {
        call,
        calls: calls.filter((candidate) => candidate.runID === workerRunID),
        ...collectRunParts(runRecords),
        workerRunID,
      },
    ];
  });
}

interface RunParts {
  readonly end?: WorkerEndActivity;
  readonly shortID?: string;
  readonly turns: readonly WorkerTurnActivity[];
}

function collectRunParts(records: readonly LiveRecord[]): RunParts {
  const started = records.find((record) => record.worker?.phase === 'started')?.worker;
  const endRecord = records.findLast((record) => record.worker?.phase === 'ended');
  const end = endRecord?.worker;

  const turns = records.flatMap((record): readonly WorkerTurnActivity[] => {
    const worker = record.worker;

    if (worker?.phase !== 'turn') {
      return [];
    }

    return [
      {
        dollars: worker.dollars,
        isCut: isCutField(record, 'worker.text'),
        isForgotten: record.isRemoved === true,
        record: { sequence: record.sequence, thread: record.thread },
        ...(worker.text === undefined ? {} : { text: worker.text }),
        tokens: worker.tokens,
        turn: worker.turn,
      },
    ];
  });

  return {
    ...(end?.phase === 'ended' && endRecord !== undefined
      ? {
          end: {
            ...(end.detail === undefined ? {} : { detail: end.detail }),
            isCut: isCutField(endRecord, 'worker.detail'),
            ...(end.limit === undefined ? {} : { limit: end.limit }),
            outcome: end.outcome,
            record: { sequence: endRecord.sequence, thread: endRecord.thread },
            used: end.used,
          },
        }
      : {}),
    ...(started?.phase === 'started' ? { shortID: started.shortID } : {}),
    turns: turns.toSorted((left, right) => left.turn - right.turn),
  };
}

function isCutField(record: LiveRecord, field: string): boolean {
  return (
    record.isRemoved !== true && (record.clipped?.some((clip) => clip.field === field) ?? false)
  );
}
