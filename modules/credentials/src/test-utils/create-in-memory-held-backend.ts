import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type {
  CredentialRecorder,
  HeldBackend,
  HeldClient,
  HeldState,
  HeldToken,
} from '../held/types';

export interface InMemoryHeldBackend extends HeldBackend {
  // the key IDs that exist, so a test sees which keys a refresh left behind
  readonly readKeyIDs: () => readonly string[];
}

export interface InMemoryHeldBackendOptions {
  // the recorder that a token's own record goes through when the token saves
  readonly recorder: CredentialRecorder;

  // a JSON file that mirrors every change, so a process that starts later on the same file holds
  // what an earlier one saved
  readonly file?: string;
}

const stateSchema = z.object({
  status: z.enum(['active', 'failing', 'needs_consent']),
  reason: z.enum(['unauthorised', 'service_error', 'no_answer']).exactOptional(),
  sinceMs: z.number(),
  lastSuccessAtMs: z.number().nullable(),
  failures: z.number(),
  retryAtMs: z.number().nullable(),
});

const clientSchema = z.object({ clientSecret: z.string() });

const tokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAtMs: z.number(),
  keyID: z.string(),
  clientCredentialID: z.string(),
  accountSubject: z.string().nullable(),
  state: stateSchema,
});

const clientEntrySchema = z.tuple([z.string(), clientSchema]);
const tokenEntrySchema = z.tuple([z.string(), tokenSchema]);
const counterEntrySchema = z.tuple([z.string(), z.number()]);

const snapshotSchema = z.object({
  clients: z.array(clientEntrySchema),
  tokens: z.array(tokenEntrySchema),
  counters: z.array(counterEntrySchema),
  keys: z.array(z.string()),
});

// A held backend in memory, for tests. Nothing in a release build uses it. The database backend
// saves a token and its record in one transaction; this one writes the record, then the token, which
// a test double cannot do atomically.
export function createInMemoryHeldBackend(
  options: InMemoryHeldBackendOptions,
): InMemoryHeldBackend {
  const stored =
    options.file !== undefined && existsSync(options.file)
      ? snapshotSchema.parse(JSON.parse(readFileSync(options.file, 'utf8')))
      : { clients: [], tokens: [], counters: [], keys: [] };

  const clients = new Map<string, HeldClient>(stored.clients);
  const tokens = new Map<string, HeldToken>(stored.tokens);
  const counters = new Map<string, number>(stored.counters);
  const keys = new Set<string>(stored.keys);

  const readCounter = (credentialID: string): number => counters.get(credentialID) ?? 0;

  const mirror = (): void => {
    if (options.file !== undefined) {
      writeFileSync(
        options.file,
        JSON.stringify({
          clients: [...clients],
          tokens: [...tokens],
          counters: [...counters],
          keys: [...keys],
        }),
      );
    }
  };

  const changeState = (credentialID: string, state: HeldState): void => {
    const token = tokens.get(credentialID);

    if (token !== undefined) {
      tokens.set(credentialID, { ...token, state });
    }
  };

  return {
    readRemovalCounter: (credentialID) => Promise.resolve(readCounter(credentialID)),
    readClient: (credentialID) => Promise.resolve(clients.get(credentialID) ?? null),
    writeClient: (credentialID, client) => {
      clients.set(credentialID, client);

      mirror();

      return Promise.resolve();
    },
    readToken: (credentialID) => Promise.resolve(tokens.get(credentialID) ?? null),
    writeToken: async (credentialID, token, expectedCounter, record) => {
      if (readCounter(credentialID) !== expectedCounter) {
        return 'removed';
      }

      if (record !== null) {
        await options.recorder.write(record);
      }

      // the removal counter may have moved while the record went in
      if (readCounter(credentialID) !== expectedCounter) {
        return 'removed';
      }

      tokens.set(credentialID, token);

      mirror();

      return 'saved';
    },
    writeState: (credentialID, state, expectedCounter) => {
      if (readCounter(credentialID) !== expectedCounter) {
        return Promise.resolve('removed');
      }

      changeState(credentialID, state);
      mirror();

      return Promise.resolve('saved');
    },
    createKey: () => {
      const keyID = crypto.randomUUID();

      keys.add(keyID);

      mirror();

      return Promise.resolve(keyID);
    },
    removeKey: (keyID) => {
      keys.delete(keyID);

      mirror();

      return Promise.resolve();
    },
    remove: (credentialID) => {
      const token = tokens.get(credentialID);

      if (token !== undefined) {
        keys.delete(token.keyID);
      }

      tokens.delete(credentialID);
      clients.delete(credentialID);
      counters.set(credentialID, readCounter(credentialID) + 1);

      mirror();

      return Promise.resolve(readCounter(credentialID));
    },
    readKeyIDs: () => [...keys],
  };
}
