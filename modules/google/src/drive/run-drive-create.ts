import type { ActionAttempt, ProviderResponse } from '@heynixie/connections';
import { callGoogle } from '../call/call-google';
import { pickGoogleErrorResponse } from '../call/pick-google-error-response';
import { buildItemID } from '../gmail/build-item-id';
import { readCallContext } from '../gmail/read-call-context';
import { buildAttemptMarker } from '../marker/build-attempt-marker';
import type { GoogleDeps } from '../types';
import { buildDriveMultipart } from './build-drive-multipart';
import { googleDocType } from './constants';
import { driveArgumentsSchema } from './drive-arguments-schema';
import { parseDriveFile } from './parse-drive-file';

// The attempt of drive.create: uploads the text as a new file in the root of My Drive, shared with
// no one, and writes the action's marker with it. A Google Doc takes the text as Markdown.
export async function runDriveCreate(
  deps: GoogleDeps,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  const parsed = driveArgumentsSchema.create.safeParse(attempt.arguments);

  if (context === null) {
    return { kind: 'refused', reason: 'connection_forgotten' };
  }

  if (!parsed.success) {
    return { kind: 'refused', reason: 'the arguments of the file are unreadable' };
  }

  const marker = buildAttemptMarker(attempt, deps.clock.now());
  const isDoc = parsed.data.as === 'google_doc';

  const upload = buildDriveMultipart(
    {
      name: parsed.data.name,
      mimeType: isDoc ? googleDocType : 'text/plain',
      appProperties: { [marker.key]: marker.value },
    },
    { type: isDoc ? 'text/markdown' : 'text/plain', text: parsed.data.text },
    marker.key,
  );

  const created = await callGoogle(deps.hosts, context, {
    path: '/upload/drive/v3/files',
    method: 'POST',
    query: { uploadType: 'multipart', fields: 'id,webViewLink', supportsAllDrives: 'true' },
    raw: upload,
  });

  if (created.kind === 'error') {
    return pickGoogleErrorResponse(created);
  }

  const file = parseDriveFile(created.body);

  return file === null
    ? { kind: 'ambiguous', reason: 'Google answered with no file' }
    : {
        kind: 'success',
        result: { file: buildItemID(context.connection, file.id), link: file.link },
      };
}
