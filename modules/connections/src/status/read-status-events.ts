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

  const live = rows.filter((row) => row.binding === 'enabled' || row.binding === 'disabled');

  const facts = await readConnectionFacts(context, live);
  const steps = await readStatusSteps(context, new Set(facts.keys()));

  const hasReturn = steps.some(
    (step) =>
      step.step.kind === 'active' && step.sequence > range.after && step.sequence <= range.through,
  );

  return collectStatusEvents(
    {
      steps,
      failedCalls: hasReturn ? await readNotes(context, callFailedCodec) : [],
      skippedRuns: hasReturn ? await readNotes(context, runWithoutCodec) : [],
      facts,
    },
    range,
  );
}

// A call that began in a break notes its failure after the answer that ended the break, so the read
// runs past the range.
async function readNotes(
  context: ServiceContext,
  codec: typeof callFailedCodec | typeof runWithoutCodec,
): Promise<BreakNote[]> {
  const records = await readAllRecords(context.log, [codec.kind]);

  return records.map((record) => ({
    sequence: record.sequence,
    connection: codec.decode(record.payload).connection,
  }));
}
