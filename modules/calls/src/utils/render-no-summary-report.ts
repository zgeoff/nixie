// The report of a call whose closing turn wrote no summary or never ran: it links the call's record.
export function renderNoSummaryReport(callID: string, taskID: string): string {
  return `The call ${callID} ended with no summary. Its record is the thread of the task ${taskID}.`;
}
