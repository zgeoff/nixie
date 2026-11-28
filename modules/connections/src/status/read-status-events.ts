import { readConnectionRows } from '../connection/read-connection-rows';
import { callFailedCodec } from '../record/call-failed-codec';
import { runWithoutCodec } from '../record/run-without-codec';
import type { ServiceContext } from '../service-context';
import { collectStatusEvents } from './collect-status-events';
import type { BreakNote } from './collect-status-events';
import { readAllRecords } from './read-all-records';
import { readConnectionFacts } from './read-connection-facts';
import { readStatusSteps } from './read-status-steps';
import type { StatusEvent, StatusEventRange } from './types';

// The status events of the log range, each with the label and account of its connection read now. A
// forgotten connection has no event, and no record holds a label or an account.
export async function readStatusEvents(
  context: ServiceContext,
  range: StatusEventRange,
): Promise<StatusEvent[]> {
  const rows = await readConnectionRows(context.log);

  const live = rows.filter((row) => row.binding === 'enabled');

  const facts = await readConnectionFacts(context, live);
  const steps = await readStatusSteps(context, new Set(facts.keys()));

  const hasReturn = steps.some(
    (step) =>
      step.step.kind === 'active' && step.sequence > range.after && step.sequence <= range.through,
  );

  return collectStatusEvents(
    {
      steps,
      failedCalls: hasReturn ? await readCallNotes(context) : [],
      skippedRuns: hasReturn ? await readRunNotes(context) : [],
      facts,
    },
    range,
  );
}

// A call that began in a break notes its failure after the answer that ended the break, so the read
// runs past the range. A call counts at the time it began, and a job run at the time it started.
async function readCallNotes(context: ServiceContext): Promise<BreakNote[]> {
  const records = await readAllRecords(context.log, [callFailedCodec.kind]);

  return records.map((record) => {
    const note = callFailedCodec.decode(record.payload);

    return { atMs: note.callAtMs, connection: note.connection };
  });
}

async function readRunNotes(context: ServiceContext): Promise<BreakNote[]> {
  const records = await readAllRecords(context.log, [runWithoutCodec.kind]);

  return records.map((record) => ({
    atMs: record.recordedAt.getTime(),
    connection: runWithoutCodec.decode(record.payload).connection,
  }));
}
