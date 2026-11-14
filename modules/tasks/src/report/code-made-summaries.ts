// The summary of a task run that ends with no task.report call.
export const codeMadeSummaries = {
  limit: 'The run stopped at its {limit} limit before it wrote a summary.',
  stopped: 'The run was stopped before it wrote a summary.',
  closed: 'The task was closed before it wrote a summary.',
  failed: 'The run failed after {count} errors before it wrote a summary.',
  no_work: 'The run had nothing to do, so it ran no model turn.',
  no_report: 'The run ended before it wrote a summary.',
} as const;
