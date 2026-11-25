import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.picker_set' satisfies ConnectionRecordKind;

// The Drive picker's settings of a client changed. The record names the client and holds neither value.
export const pickerSetCodec = defineRecordCodec(kind, z.object({ client: z.string() }));
