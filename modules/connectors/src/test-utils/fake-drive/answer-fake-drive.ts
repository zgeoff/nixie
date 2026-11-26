import { buildFakeFileJSON } from './build-fake-file-json';
import { listFakeFiles } from './list-fake-files';
import type { FakeDrive, FakeDriveCall, FakeDriveState } from './types';
import { uploadFakeFile } from './upload-fake-file';

// Routes one Drive request to the fake: the file list, a file's metadata, content and export, and
// the multipart uploads.
export function answerFakeDrive(
  drive: FakeDrive,
  state: FakeDriveState,
  call: FakeDriveCall,
): Promise<Response> | Response {
  const segments = call.url.pathname
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => decodeURIComponent(segment));

  const isUpload = segments[0] === 'upload';
  const skipped = isUpload ? 3 : 2;
  const [kind, id, action] = segments.slice(skipped);

  if (kind !== 'files') {
    return notFound();
  }

  if (isUpload) {
    return uploadFakeFile(drive, state, { ...call, id });
  }

  if (id === undefined) {
    return listFakeFiles(drive, call.url);
  }

  const stored = drive.files.get(id);

  if (stored === undefined) {
    return notFound();
  }

  if (action === 'export') {
    return new Response(stored.bytes, {
      headers: { 'content-type': call.url.searchParams.get('mimeType') ?? 'text/plain' },
    });
  }

  return call.url.searchParams.get('alt') === 'media'
    ? new Response(stored.bytes, { headers: { 'content-type': stored.mimeType } })
    : Response.json(buildFakeFileJSON(stored));
}

function notFound(): Response {
  return new Response('{"error":{"errors":[{"reason":"notFound"}]}}', { status: 404 });
}
