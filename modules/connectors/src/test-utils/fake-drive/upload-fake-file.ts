import { z } from 'zod';
import { buildFakeFileJSON } from './build-fake-file-json';
import { buildFakeModifiedTime } from './build-fake-modified-time';
import { parseFakeMultipart } from './parse-fake-multipart';
import type { FakeDrive, FakeDriveCall, FakeDriveState, StoredFile } from './types';

const metadataSchema = z
  .object({
    name: z.string().optional(),
    mimeType: z.string().optional(),
    appProperties: z.record(z.string(), z.string().nullable()).optional(),
  })
  .loose();

// The multipart upload of the fake: a POST makes a file in the root of My Drive, shared with no one,
// and a PATCH of a file's ID replaces its content and merges its name and app properties, where a
// null app property deletes it.
export async function uploadFakeFile(
  drive: FakeDrive,
  state: FakeDriveState,
  call: FakeDriveCall & { readonly id: string | undefined },
): Promise<Response> {
  const body = await call.request.text();

  const multipart = parseFakeMultipart(call.request.headers.get('content-type') ?? '', body);
  const metadata = metadataSchema.safeParse(multipart?.metadata);

  if (multipart === null || !metadata.success) {
    return new Response('{"error":{"errors":[{"reason":"badRequest"}]}}', { status: 400 });
  }

  const bytes = new TextEncoder().encode(multipart.text);

  const modifiedTime = buildFakeModifiedTime(state);
  const properties = metadata.data.appProperties ?? {};

  if (call.id === undefined) {
    const id = `file${String(state.counter).padStart(4, '0')}`;

    const file: StoredFile = {
      id,
      name: metadata.data.name ?? 'Untitled',
      mimeType: metadata.data.mimeType ?? multipart.mediaType,
      bytes,
      modifiedTime,
      version: String(state.counter),
      isShared: false,
      driveID: null,
      isTrashed: false,
      appProperties: keepValues(properties),
    };

    drive.files.set(id, file);

    return Response.json(buildFakeFileJSON(file));
  }

  const stored = drive.files.get(call.id);

  if (stored === undefined) {
    return new Response('{"error":{"errors":[{"reason":"notFound"}]}}', { status: 404 });
  }

  stored.name = metadata.data.name ?? stored.name;
  stored.bytes = bytes;
  stored.modifiedTime = modifiedTime;
  stored.version = String(state.counter);

  for (const [key, value] of Object.entries(properties)) {
    if (value === null) {
      Reflect.deleteProperty(stored.appProperties, key);
    } else {
      stored.appProperties[key] = value;
    }
  }

  return Response.json(buildFakeFileJSON(stored));
}

function keepValues(properties: Readonly<Record<string, string | null>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]) => (value === null ? [] : [[key, value]])),
  );
}
