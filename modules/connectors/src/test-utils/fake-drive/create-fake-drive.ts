import { buildFakeHold } from '../fake-gmail/build-fake-hold';
import { answerFakeDrive } from './answer-fake-drive';
import { buildFakeModifiedTime } from './build-fake-modified-time';
import type { FakeDrive } from './types';

// An in-memory Google Drive that answers the calls of the Drive tools: the file list, a file's
// metadata, content and export, and the multipart uploads that make and replace a file.
export function createFakeDrive(): FakeDrive {
  const state = { counter: 0 };

  const drive: FakeDrive = {
    files: new Map(),
    requests: [],
    failures: [],
    holds: [],
    emptyListPages: 0,
    hold: (line) => {
      const hold = buildFakeHold(line);

      drive.holds.push(hold);

      return hold;
    },
    seed: (seed) => {
      const modifiedTime = buildFakeModifiedTime(state);
      const id = seed.id ?? `seeded${String(state.counter).padStart(4, '0')}`;

      drive.files.set(id, {
        id,
        name: seed.name,
        mimeType: seed.mimeType ?? 'text/plain',
        bytes: seed.bytes ?? new TextEncoder().encode(seed.text ?? ''),
        modifiedTime,
        version: String(state.counter),
        isShared: seed.isShared ?? false,
        driveID: seed.driveID ?? null,
        isTrashed: seed.isTrashed ?? false,
        appProperties: { ...seed.appProperties },
      });

      return { id };
    },
    serve: async (request) => {
      const url = new URL(request.url);

      if (!url.pathname.startsWith('/drive/v3') && !url.pathname.startsWith('/upload/drive/v3')) {
        return null;
      }

      const line = `${request.method} ${url.pathname}${url.search}`;

      drive.requests.push(line);

      const held = drive.holds.find((entry) => line.startsWith(entry.line));

      if (held !== undefined) {
        drive.holds.splice(drive.holds.indexOf(held), 1);

        await held.arrive();
      }

      const failure = drive.failures.find((entry) => line.startsWith(entry.line));

      if (failure !== undefined) {
        drive.failures.splice(drive.failures.indexOf(failure), 1);

        const failed = new Response(
          failure.body ?? '{"error":{"errors":[{"reason":"backendError"}]}}',
          {
            status: failure.status,
            ...(failure.headers === undefined ? {} : { headers: failure.headers }),
          },
        );

        return failed;
      }

      return answerFakeDrive(drive, state, { request, url });
    },
  };

  return drive;
}
