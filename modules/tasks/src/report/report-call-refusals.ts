// The sentences of a task.report call that nixie refuses. A refusal never repeats a value or a key
// that the model sent, because a forget of the report never reaches the refused call's result.
export const reportCallRefusals = {
  mismatch:
    "This report's fields do not match the shape this task declares, so nixie sent nothing and the run goes on. {faults} Call task.report again with a summary and with fields that match this schema: {schema}",
  noShape:
    'This task declares no report fields, so nixie sent nothing and the run goes on. Call task.report again with a summary only.',
  size: "This report's fields are {n} characters and the most is 16000, so nixie sent nothing and the run goes on. Call task.report again with shorter fields.",
  second: 'This run already sent its report as {reportID}.',
  staleStep:
    'This call comes from a step that no longer holds its task, so nixie sent nothing and the run goes on.',
  emptySummary: 'A report needs a summary, so nixie sent nothing and the run goes on.',
  noRun: 'This task has no run to report on, so nixie sent nothing.',
} as const;

export const maxReportFieldCharacters = 16_000;
