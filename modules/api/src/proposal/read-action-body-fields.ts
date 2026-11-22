import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { readForgetBodyFields } from './read-forget-body-fields';
import { readImageBodyFields } from './read-image-body-fields';
import { readScreenBodyFields } from './read-screen-body-fields';

// The extra card fields of an action: the tool that owns the call answers, and a tool with none
// answers none.
export async function readActionBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  const forget = await readForgetBodyFields(log, request);

  if (forget.status !== 'none') {
    return forget;
  }

  const image = await readImageBodyFields(log, request);

  return image.status === 'none' ? readScreenBodyFields(log, request) : image;
}
