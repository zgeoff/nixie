import type { JSONObject } from '@heynixie/log';

export interface ReportBody {
  readonly summary: string;

  // the fields of an accepted report, only for a task run with a shape
  readonly fields?: JSONObject;

  // the declared names that a code-made summary leaves unfilled, only for a task run with a shape
  readonly missing?: readonly string[];
}

// The erasable body of task.run_ended and of the delivered message. The end writer renders it once,
// so both records hold the same text.
export function renderReportBody(report: ReportBody): string {
  return Bun.YAML.stringify(
    {
      report: {
        summary: report.summary,
        ...(report.fields === undefined ? {} : { fields: report.fields }),
        ...(report.missing === undefined ? {} : { missing: report.missing }),
      },
    },
    null,
    2,
  );
}
