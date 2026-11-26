import type { ActionAttempt, ProviderResponse } from '../../types';
import { collectStaleMarkerKeys } from '../build-action-marker';
import { callGoogle } from '../call-google';
import { buildItemID } from '../gmail/build-item-id';
import { parseItemID } from '../gmail/parse-item-id';
import { readCallContext } from '../gmail/read-call-context';
import { pickGoogleErrorResponse } from '../pick-google-error-response';
import { readActionMarker } from '../read-action-marker';
import type { GoogleDeps } from '../types';
import { buildDriveMultipart } from './build-drive-multipart';
import { googleDocType } from './constants';
import { driveArgumentsSchema } from './drive-arguments-schema';
import { parseDriveFile } from './parse-drive-file';
import { pickDriveChangeRefusal } from './pick-drive-change-refusal';
import { readDriveFile } from './read-drive-file';

// The attempt of drive.change: reads the file again, refuses a file that is shared or in a shared
// drive, and uploads the new content with the action's marker. A file that already holds the marker
// counts as done.
export async function runDriveChange(
  deps: GoogleDeps,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  const parsed = driveArgumentsSchema.change.safeParse(attempt.arguments);

  if (context === null) {
    return { kind: 'refused', reason: 'connection_forgotten' };
  }

  const item = parsed.success ? parseItemID(parsed.data.file) : null;

  if (!parsed.success || item === null) {
    return { kind: 'refused', reason: 'the arguments of the change are unreadable' };
  }

  const read = await readDriveFile(deps.hosts, context, item.id);

  if (read.kind === 'missing') {
    return { kind: 'refused', reason: 'UNKNOWN_FILE: the file is gone' };
  }

  if (read.kind === 'failed') {
    return {
      kind: 'refused_retryable',
      reason: `GOOGLE_FAILED: ${read.reason}`,
      ...(read.retryAfterMs === null ? {} : { retryAfterMs: read.retryAfterMs }),
    };
  }

  const file = read.file;

  const marker = await readActionMarker(deps, attempt.actionID);

  const result = { file: buildItemID(context.connection, file.id), link: file.link };

  if (marker.key in file.appProperties) {
    return { kind: 'success', result };
  }

  const refusal = pickDriveChangeRefusal(file);

  if (refusal !== null) {
    return { kind: 'refused', reason: refusal.message };
  }

  const stale = collectStaleMarkerKeys(file.appProperties, marker);

  const upload = buildDriveMultipart(
    {
      ...(parsed.data.name === undefined || parsed.data.name === null
        ? {}
        : { name: parsed.data.name }),
      appProperties: {
        [marker.key]: marker.value,
        ...Object.fromEntries(stale.map((key) => [key, null])),
      },
    },
    {
      type: file.mimeType === googleDocType ? 'text/markdown' : file.mimeType,
      text: parsed.data.text,
    },
    marker.key,
  );

  const changed = await callGoogle(deps.hosts, context, {
    path: `/upload/drive/v3/files/${encodeURIComponent(file.id)}`,
    method: 'PATCH',
    query: { uploadType: 'multipart', fields: 'id,webViewLink', supportsAllDrives: 'true' },
    raw: upload,
  });

  if (changed.kind === 'error') {
    return pickGoogleErrorResponse(changed);
  }

  const updated = parseDriveFile(changed.body);

  return updated === null
    ? { kind: 'ambiguous', reason: 'Google answered with no file' }
    : { kind: 'success', result: { file: result.file, link: updated.link } };
}
