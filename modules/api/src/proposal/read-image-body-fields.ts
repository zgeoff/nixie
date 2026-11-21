import { readPhotoImageIDs } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { z } from 'zod';

const drawToolName = 'image.draw';

const drawInputSchema = z.object({
  from: z.string().optional(),
  references: z.array(z.string()).default([]),
});

// The card of a draw that names a photo shows each photo, because the draw sends it to the
// provider. The photos are read when the card is read, from the images the call names.
export async function readImageBodyFields(
  log: Pick<Log, 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  if (request.tool !== drawToolName) {
    return { status: 'none' };
  }

  const input = drawInputSchema.safeParse(request.input);

  if (!input.success) {
    return { status: 'none' };
  }

  const named = [
    ...(input.data.from === undefined ? [] : [input.data.from]),
    ...input.data.references,
  ];

  const images = await readPhotoImageIDs(log, named);

  return images.length === 0 ? { status: 'none' } : { status: 'fields', fields: {}, images };
}
