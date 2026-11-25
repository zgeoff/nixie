import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.client_removed' satisfies ConnectionRecordKind;

export const clientRemovedCodec = defineRecordCodec(kind, z.object({ client: z.string() }));
