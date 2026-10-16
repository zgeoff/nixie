// How many failed steps in a row end a task as failed, or mark the conversation's turns as failing,
// when the runners take no other limit. The server reads it at start to seed the turns it reports.
export const DEFAULT_MAX_STEP_ERRORS = 3;
