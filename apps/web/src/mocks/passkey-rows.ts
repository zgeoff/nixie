import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

// One passkey as the host lists it. The mock never checks a signature, so a row names only the
// credential that its browser registered.
export const passkeyRows = new Collection({
  schema: z.object({
    authorizedBy: z.string().default('code'),
    credentialID: z.string().default(() => faker.string.alphanumeric(22)),
    isSynced: z.boolean().default(false),
    label: z.string().default('Passkey'),
    lastUsedAt: z.date().nullable().default(null),
    passkeyID: z.uuid().default(() => faker.string.uuid()),
    registeredAt: z.date().default(() => faker.date.recent()),
    revokedAt: z.date().nullable().default(null),
  }),
});

// The assertions that an answer carried, so a test sees that the card asked the passkey.
export const passkeyChecks = new Collection({
  schema: z.object({
    challenge: z.string(),
    choice: z.enum(['approve', 'always_allow', 'defer', 'decline']),
    credentialID: z.string(),
    proposalID: z.string(),
  }),
});

// The one-time code that the mock host accepts, as `nixie passkey-code` prints for the real one.
export const mockPasskeyCode = 'MOCK1-CODE2';
