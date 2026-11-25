import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type {
  CredentialEvent,
  CredentialRecorder,
  HeldBackend,
  HeldClient,
  HeldState,
  HeldToken,
} from '../held/types';

export interface InMemoryHeldBackend extends HeldBackend {
  // the key IDs that exist, so a test sees which keys a refresh left behind
  readonly readKeyIDs: () => readonly string[];

  // At start: writes the record of a token that saved in a process that died before its record went
  // to the log, so the token and its record come out together, as one transaction leaves them.
  readonly settle: () => Promise<void>;
}

export interface InMemoryHeldBackendOptions {
  // the recorder that a token's own record goes through when the token saves
  readonly recorder: CredentialRecorder;

  // a JSON file that mirrors every change, so a process that starts later on the same file holds
  // what an earlier one saved
  readonly file?: string;

  // runs after the token is saved and before its record is written: a crash test holds the process
  // here
  readonly afterTokenSaved?: () => Promise<void>;
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

const pendingRecordSchema = z.object({
  event: z.literal('refresh_saved'),
  credentialID: z.string(),
  attemptID: z.string(),
  fingerprint: z.string(),
});

const snapshotSchema = z.object({
  pending: z.array(pendingRecordSchema),
  clients: z.array(clientEntrySchema),
  tokens: z.array(tokenEntrySchema),
  counters: z.array(counterEntrySchema),
  keys: z.array(z.string()),
});

// A held backend in memory, for tests. Nothing in a release build uses it. The database backend
// saves a token and its record in one transaction. This one writes the token and the record it owes
// to the file together, then the record to the log, and `settle` finishes a record a crash left owed.
export function createInMemoryHeldBackend(
  options: InMemoryHeldBackendOptions,
): InMemoryHeldBackend {
  const stored =
    options.file !== undefined && existsSync(options.file)
      ? snapshotSchema.parse(JSON.parse(readFileSync(options.file, 'utf8')))
      : { pending: [], clients: [], tokens: [], counters: [], keys: [] };

  const clients = new Map<string, HeldClient>(stored.clients);
  const tokens = new Map<string, HeldToken>(stored.tokens);
  const counters = new Map<string, number>(stored.counters);
  const keys = new Set<string>(stored.keys);

  const pending = [...stored.pending];
  const readCounter = (credentialID: string): number => counters.get(credentialID) ?? 0;

  const mirror = (): void => {
    if (options.file !== undefined) {
      writeFileSync(
        options.file,
        JSON.stringify({
          pending,
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

      tokens.set(credentialID, token);

      if (record !== null) {
        invariant(isSavedRecord(record), 'only a refresh saves a token with a record');

        pending.push(record);
      }

      mirror();

      await options.afterTokenSaved?.();

      if (record !== null) {
        await options.recorder.write(record);

        pending.splice(pending.indexOf(record), 1);

        mirror();
      }

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
    settle: async () => {
      const open = await options.recorder.readOpenRefreshes();

      for (const record of pending.splice(0)) {
        if (open.some((entry) => entry.attemptID === record.attemptID)) {
          await options.recorder.write(record);
        }
      }

      mirror();
    },
  };
}

function isSavedRecord(record: CredentialEvent): record is z.output<typeof pendingRecordSchema> {
  return record.event === 'refresh_saved';
}
