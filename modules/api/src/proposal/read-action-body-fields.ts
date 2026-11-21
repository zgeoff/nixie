import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { readForgetBodyFields } from './read-forget-body-fields';
import { readImageBodyFields } from './read-image-body-fields';

// The extra card fields of an action: the tool that owns the call answers, and a tool with none
// answers none.
export async function readActionBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  const forget = await readForgetBodyFields(log, request);

  return forget.status === 'none' ? readImageBodyFields(log, request) : forget;
}
