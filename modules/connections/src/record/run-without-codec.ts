import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.run_without' satisfies ConnectionRecordKind;

// A job run started while a connection it is pinned to was broken. The record holds only the
// connection's ID, so the return to `active` can count the runs of the break.
export const runWithoutCodec = defineRecordCodec(kind, z.object({ connection: z.string() }));
