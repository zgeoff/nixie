import { expect, test } from 'bun:test';
import { sealSpoolBody } from '../seal-spool-body';
import { buildFileWithHeader } from './build-file-with-header';
import { createSpoolRecipient } from './create-spool-recipient';
import { parseSealedHeader } from './parse-sealed-header';

test('#buildFileWithHeader gives a file whose length prefix matches the new header', async () => {
  const recipient = await createSpoolRecipient();

  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';

  const file = await sealSpoolBody(
    { captureID, sealTo: recipient.sealTo },
    {
      version: 1,
      captureID,
      writer: 'ab',
      counter: 1,
      receivedAt: 1,
      route: 'harbour',
      api: 'anthropic-messages',
      endpoint: 'messages',
      bytes: 3,
    },
    new Uint8Array(3),
  );

  const changed = buildFileWithHeader(file, { ...parseSealedHeader(file), route: 'quay' });

  expect(parseSealedHeader(changed)).toMatchObject({ route: 'quay' });
});
