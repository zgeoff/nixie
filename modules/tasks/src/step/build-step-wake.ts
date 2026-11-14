import type { EnvelopeRecord } from '@heynixie/log';
import type { StepWake } from '../types';
import { pickWakeSource } from './pick-wake-source';

export type WakeRecord = Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread'>;

export function buildStepWake(unread: readonly WakeRecord[], previousHop: number): StepWake {
  return pickWakeSource(unread)?.wake ?? { hop: previousHop, cause: { kind: 'carried' } };
}
