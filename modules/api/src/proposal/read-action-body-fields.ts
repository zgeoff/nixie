import type { Log } from '@heynixie/log';
import { readMailBodyFields } from '@heynixie/mail';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import type { APISettings } from '../types';
import { buildMailFileReader } from './build-mail-file-reader';
import { readForgetBodyFields } from './read-forget-body-fields';
import { readImageBodyFields } from './read-image-body-fields';
import { readRetopicBodyFields } from './read-retopic-body-fields';
import { readScreenBodyFields } from './read-screen-body-fields';

// The extra card fields of an action: the tool that owns the call answers, and a tool with none
// answers none.
export async function readActionBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
  mail: APISettings['mail'],
): Promise<BodyFields> {
  const sends =
    mail === undefined
      ? null
      : await readMailBodyFields(buildMailFileReader(log), request, mail.replyExpiryMs);

  if (sends !== null && sends.status !== 'none') {
    return sends;
  }

  const forget = await readForgetBodyFields(log, request);

  if (forget.status !== 'none') {
    return forget;
  }

  const retopic = await readRetopicBodyFields(log, request);

  if (retopic.status !== 'none') {
    return retopic;
  }

  const image = await readImageBodyFields(log, request);

  return image.status === 'none' ? readScreenBodyFields(log, request) : image;
}
