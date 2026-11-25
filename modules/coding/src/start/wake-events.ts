import type { WakeEvent } from '../types';

export const wakeEvents: readonly WakeEvent[] = [
  'waiting',
  'idle',
  'ended',
  'gone',
  'progress',
  'blocked',
  'decision',
];
