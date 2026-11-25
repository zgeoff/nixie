import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import { z } from 'zod';

const backupSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('off') }),
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('failed'), failure: z.string() }),
  z.object({ state: z.literal('complete') }),
  z.object({ state: z.literal('unknown') }),
]);

const forgetSchema = z.object({
  erasure: z.enum(['pending', 'done']),
  revocation: z.enum(['pending', 'confirmed', 'refused', 'unknown', 'not_attempted']),
  backup: backupSchema,
});

const scopeListSchema = z.array(z.string());

const missingSchema = z.object({
  scope: z.string(),
  reason: z.enum(['not_granted', 'api_disabled']),
});

// The one OAuth client a connector holds.
const clients = new Collection({
  schema: z.object({
    client: z.string().default(buildShortID),
    clientID: z.string(),
    origin: z.string(),
    redirectURI: z.string(),
    fingerprint: z.string().default(() => faker.string.hexadecimal({ length: 12, prefix: '' })),
    pickerKey: z.string().nullable().default(null),
    projectNumber: z.string().nullable().default(null),
  }),
});

const connections = new Collection({
  schema: z.object({
    connection: z.string().default(buildShortID),
    connector: z.string().default('google'),
    label: z.string().nullable().default('you@example.test'),
    account: z.string().nullable().default('you@example.test'),
    status: z
      .enum(['active', 'failing', 'needs_consent', 'expiring', 'forgotten'])
      .default('active'),
    reason: z.enum(['unauthorised', 'service_error', 'no_answer']).nullable().default(null),
    statusSince: z.date().default(() => new Date()),
    lastSuccessAt: z.date().nullable().default(null),
    scopes: scopeListSchema.default([]),
    missing: z.array(missingSchema).default([]),
    fingerprint: z.string().nullable().default(null),
    forget: forgetSchema.nullable().default(null),
  }),
});

// A consent that started, bound to the device session that started it.
const consents = new Collection({
  schema: z.object({
    state: z.string(),
    sessionID: z.string(),
    connection: z.string().nullable(),
  }),
});

const allScopes = [
  'gmail.modify',
  'calendar.events',
  'calendar.calendarlist.readonly',
  'drive.file',
];

// What the mock Google answers, which a test changes before it finishes a consent or a forget.
const answers: { grantedScopes: string[]; forget: z.infer<typeof forgetSchema> } = {
  grantedScopes: [...allScopes],
  forget: { erasure: 'done', revocation: 'confirmed', backup: { state: 'pending' } },
};

export const connectionStore = {
  allScopes,
  answers,
  clients,
  connections,
  consents,
  reset: (): void => {
    for (const collection of [clients, connections, consents]) {
      collection.clear();
    }

    answers.grantedScopes = [...allScopes];
    answers.forget = { erasure: 'done', revocation: 'confirmed', backup: { state: 'pending' } };
  },
};

export function buildShortID(): string {
  return faker.string.alphanumeric({ length: 10, casing: 'lower' });
}
