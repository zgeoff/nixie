import { WringerError } from '@wringer/core';
import { pickHealthRefusal, readinessReportSchema } from './pick-health-refusal';
import { runProdKubectl } from './run-prod-kubectl';

type Env = Readonly<Record<string, string | undefined>>;

// The public origin's readiness path answers from the web client, so the check reads nixie's own
// report through the API server's proxy to nixie's Service.
const readinessPath = '/api/v1/namespaces/nixie/services/http:nixie:http/proxy/health/ready';

export async function readProdHealth(env: Env): Promise<{ status: string }> {
  const reportText = await runProdKubectl(env, ['get', '--raw', readinessPath]);

  const report = readinessReportSchema.parse(JSON.parse(reportText));
  const refusal = pickHealthRefusal(report);

  if (refusal !== null) {
    throw new WringerError('check-failed', { message: refusal });
  }

  return { status: report.status };
}
