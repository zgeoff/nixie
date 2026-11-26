import type { ActionAttempt, ConnectorContext, ProviderResponse } from '../../types';
import { collectStaleMarkerKeys, isMarkerKept } from '../build-action-marker';
import { buildAttemptMarker } from '../build-attempt-marker';
import { callGoogle } from '../call-google';
import { buildItemID } from '../gmail/build-item-id';
import { parseItemID } from '../gmail/parse-item-id';
import { readCallContext } from '../gmail/read-call-context';
import { pickGoogleErrorResponse } from '../pick-google-error-response';
import type { GoogleDeps } from '../types';
import { buildDriveMultipart } from './build-drive-multipart';
import { driveFileFields, googleDocType } from './constants';
import { driveArgumentsSchema } from './drive-arguments-schema';
import { parseDriveFile } from './parse-drive-file';
import { pickDriveChangeRefusal } from './pick-drive-change-refusal';
import { readDriveFile } from './read-drive-file';
import type { DriveFile } from './types';

// The attempt of drive.change: reads the file twice, the second time right before the upload, refuses a file that is shared or in a shared
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

  const marker = buildAttemptMarker(attempt, deps.clock.now());

  // The file is read twice, the second time right before the upload, so a share that lands while the
  // first answer is checked still stops the write. Drive takes no precondition on an upload, so no
  // check can close the gap that the upload itself leaves.
  const first = await readFileOrEnd(deps, context, item.id);

  if ('kind' in first) {
    return first;
  }

  if (marker.key in first.appProperties) {
    return {
      kind: 'success',
      result: { file: buildItemID(context.connection, first.id), link: first.link },
    };
  }

  const refusal = pickDriveChangeRefusal(first);

  if (refusal !== null) {
    return { kind: 'refused', reason: refusal.message };
  }

  const file = await readFileOrEnd(deps, context, item.id);

  if ('kind' in file) {
    return file;
  }

  const latestRefusal = pickDriveChangeRefusal(file);

  if (latestRefusal !== null) {
    return { kind: 'refused', reason: latestRefusal.message };
  }

  const result = { file: buildItemID(context.connection, file.id), link: file.link };
  const stale = collectStaleMarkerKeys(file.appProperties, marker);

  const upload = buildDriveMultipart(
    {
      ...(parsed.data.name === undefined || parsed.data.name === null
        ? {}
        : { name: parsed.data.name }),
      appProperties: {
        ...(isMarkerKept(file.appProperties, marker) ? { [marker.key]: marker.value } : {}),
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
    query: { uploadType: 'multipart', fields: driveFileFields, supportsAllDrives: 'true' },
    raw: upload,
  });

  if (changed.kind === 'error') {
    return pickGoogleErrorResponse(changed);
  }

  const updated = parseDriveFile(changed.body);

  if (updated === null) {
    return { kind: 'ambiguous', reason: 'Google answered with no file' };
  }

  // A share that lands between the last read and the upload shows only in the file that the upload
  // answers with.
  return pickDriveChangeRefusal(updated)?.code === 'shared_file'
    ? {
        kind: 'refused',
        reason:
          'SHARED_FILE: the file became shared while the change ran, so its new content may have ' +
          'reached each person who can read it',
      }
    : { kind: 'success', result: { file: result.file, link: updated.link } };
}

// The file as Drive holds it now, or the response that ends the attempt when it is gone or cannot
// be read.
async function readFileOrEnd(
  deps: GoogleDeps,
  context: ConnectorContext,
  id: string,
): Promise<DriveFile | ProviderResponse> {
  const read = await readDriveFile(deps.hosts, context, id);

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

  return read.file;
}
