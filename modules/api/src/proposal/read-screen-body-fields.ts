import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { z } from 'zod';
import {
  buildScreenPictureID,
  readScreenPicture,
  screenClickToolName,
} from './read-screen-picture';

const clickInputSchema = z.object({ x: z.number().int(), y: z.number().int() });

// The card of a screen click shows the desktop as it was when the click was prepared, with the
// point the click lands on. The picture is read when the card is read, from the call's own record.
export async function readScreenBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  if (request.tool !== screenClickToolName) {
    return { status: 'none' };
  }

  const input = clickInputSchema.safeParse(request.input);
  const picture = buildScreenPictureID(request.callSequence);

  if (!input.success || (await readScreenPicture(log, picture)) === null) {
    return { status: 'none' };
  }

  return { status: 'fields', fields: {}, screen: { x: input.data.x, y: input.data.y, picture } };
}
