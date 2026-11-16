import type { APIContext } from '../types';
import { readBriefStartCalls } from './read-brief-start-calls';
import { readReportRecords } from './read-report-records';

// The search reads the brief's text, which the cleanup destroys, so it runs before the forget
// starts and the forget's start record keeps what it found. Each record found is one that the forget
// destroys with its target, whatever part of a task's work it holds.
export async function readRecordStartCalls(
  context: APIContext,
  sequence: number,
): Promise<readonly number[]> {
  const briefCalls = await readBriefStartCalls(context, sequence);
  const reportRecords = await readReportRecords(context, sequence);

  return [...briefCalls, ...reportRecords].toSorted((left, right) => left - right);
}
