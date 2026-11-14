import { expect, test } from 'bun:test';
import { createSpoolRecipient } from './create-spool-recipient';

test('#createSpoolRecipient gives a 65-byte public key', async () => {
  const recipient = await createSpoolRecipient();

  expect(recipient.sealTo).toHaveLength(65);
});
