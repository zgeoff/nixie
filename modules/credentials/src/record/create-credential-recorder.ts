import type { Definitions, JSONObject, Log } from '@heynixie/log';
import { readRecords, writeRecords } from '@heynixie/log';
import { match } from 'ts-pattern';
import type { CredentialEvent, CredentialRecorder, OpenRefresh } from '../held/types';
import type { CredentialRecordKind } from './credential-record-kind';
import { refreshDiscardedCodec } from './refresh-discarded-codec';
import { refreshFailedCodec } from './refresh-failed-codec';
import { refreshLostCodec } from './refresh-lost-codec';
import { refreshSavedCodec } from './refresh-saved-codec';
import { refreshStartedCodec } from './refresh-started-codec';
import { statusChangedCodec } from './status-changed-codec';

export interface CredentialRecorderOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

const refreshKinds = [
  refreshStartedCodec.kind,
  refreshSavedCodec.kind,
  refreshFailedCodec.kind,
  refreshDiscardedCodec.kind,
  refreshLostCodec.kind,
] as const;

const pageSize = 500;

export function createCredentialRecorder(options: CredentialRecorderOptions): CredentialRecorder {
  return {
    write: async (event) => {
      const input = buildCredentialRecordInput(event);

      await writeRecords(options.log, [
        {
          kind: input.kind,
          payload: input.payload,
          definitions: options.definitions(),
        },
      ]);
    },
    readOpenRefreshes: async () => {
      const open = new Map<string, OpenRefresh>();

      let afterSequence = 0;

      for (;;) {
        const page = await readRecords(options.log, {
          afterSequence,
          kinds: refreshKinds,
          limit: pageSize,
        });

        for (const entry of page) {
          const record = entry.record;
          const fields = refreshStartedCodec.tryDecodePartial(record.payload);
          const attemptID = fields?.attemptID;
          const credentialID = fields?.credentialID;

          if (attemptID !== undefined && credentialID !== undefined) {
            const newKeyID = fields?.newKeyID;

            if (record.kind === refreshStartedCodec.kind && newKeyID !== undefined) {
              open.set(attemptID, {
                credentialID,
                attemptID,
                newKeyID,
                removalCounter: fields?.removalCounter ?? null,
              });
            } else {
              open.delete(attemptID);
            }
          }

          afterSequence = record.sequence;
        }

        if (page.length < pageSize) {
          return [...open.values()];
        }
      }
    },
  };
}

interface EventRecord {
  readonly kind: CredentialRecordKind;
  readonly payload: JSONObject;
}

// The record a credential event writes, for a backend that commits it inside its own transaction.
export function buildCredentialRecordInput(event: CredentialEvent): EventRecord {
  return match(event)
    .with({ event: 'refresh_started' }, (started) => ({
      kind: refreshStartedCodec.kind,
      payload: refreshStartedCodec.encode({
        credentialID: started.credentialID,
        attemptID: started.attemptID,
        newKeyID: started.newKeyID,
        removalCounter: started.removalCounter,
      }),
    }))
    .with({ event: 'refresh_saved' }, (saved) => ({
      kind: refreshSavedCodec.kind,
      payload: refreshSavedCodec.encode({
        credentialID: saved.credentialID,
        attemptID: saved.attemptID,
        fingerprint: saved.fingerprint,
      }),
    }))
    .with({ event: 'refresh_failed' }, (failed) => ({
      kind: refreshFailedCodec.kind,
      payload: refreshFailedCodec.encode({
        credentialID: failed.credentialID,
        attemptID: failed.attemptID,
        outcome: failed.outcome,
      }),
    }))
    .with({ event: 'refresh_discarded' }, (discarded) => ({
      kind: refreshDiscardedCodec.kind,
      payload: refreshDiscardedCodec.encode({
        credentialID: discarded.credentialID,
        attemptID: discarded.attemptID,
        isRevoked: discarded.isRevoked,
      }),
    }))
    .with({ event: 'refresh_lost' }, (lost) => ({
      kind: refreshLostCodec.kind,
      payload: refreshLostCodec.encode({
        credentialID: lost.credentialID,
        attemptID: lost.attemptID,
      }),
    }))
    .with({ event: 'status_changed' }, (changed) => ({
      kind: statusChangedCodec.kind,
      payload: statusChangedCodec.encode({
        credentialID: changed.credentialID,
        status: changed.status,
        ...(changed.reason === undefined ? {} : { reason: changed.reason }),
      }),
    }))
    .exhaustive();
}
