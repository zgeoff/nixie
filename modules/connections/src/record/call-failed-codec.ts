import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.call_failed' satisfies ConnectionRecordKind;

// A call of a tool failed while its connection was `failing` or `needs_consent`. The record holds
// the connection's ID and the time the call began, so the return to `active` counts the calls that
// began in the break, though the record lands after the break ends.
export const callFailedCodec = defineRecordCodec(
  kind,
  z.object({ connection: z.string(), callAtMs: z.number() }),
);
