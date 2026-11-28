import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.call_failed' satisfies ConnectionRecordKind;

// A call of a tool failed while its connection was `failing` or `needs_consent`. The record holds
// only the connection's ID, so the return to `active` can count the calls of the break.
export const callFailedCodec = defineRecordCodec(kind, z.object({ connection: z.string() }));
