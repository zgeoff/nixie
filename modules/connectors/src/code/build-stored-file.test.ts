import { expect, test } from 'bun:test';
import { buildStoredFile } from './build-stored-file';

test('#buildStoredFile names the file in the files list of a result, with its media type and size', () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  const stored = buildStoredFile({ name: 'invoice.pdf', bytes, thread: 'conversation' });

  expect(stored).toStrictEqual({
    file: expect.stringMatching(/^[a-z0-9]+$/u),
    mediaType: 'application/pdf',
    files: [
      {
        file: stored.file,
        path: 'invoice.pdf',
        bytes: 4,
        mediaType: 'application/pdf',
        isShown: false,
      },
    ],
    attachments: [bytes],
    writeBeside: expect.any(Function),
  });
});
